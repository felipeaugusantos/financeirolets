import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { findInternalTransfers, TransferCandidateEntry, TransferPair } from '@/lib/internalTransfers';
import { errorMessage } from '@/lib/utils';
import type { TablesInsert } from '@/integrations/supabase/types';

/**
 * Busca linhas pendentes de TODAS as contas no período e sugere pares de
 * transferência entre contas próprias. Ao confirmar, cria duas pernas
 * (saída e entrada) fora do DRE e vincula as duas linhas do extrato.
 */
export function useInternalTransfers(from: string, to: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<TransferCandidateEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bank_statement_entries')
      .select('id, account_id, posted_at, amount, memo, status, account:accounts(name)')
      .eq('status', 'pendente')
      .gte('posted_at', from)
      .lte('posted_at', to)
      .limit(3000);
    setRows(((data ?? [])).map(r => ({
      id: r.id,
      account_id: r.account_id,
      account_name: r.account?.name ?? 'Conta',
      posted_at: r.posted_at,
      amount: Number(r.amount),
      memo: r.memo ?? '',
      status: r.status,
    })));
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const pairs = useMemo(() => findInternalTransfers(rows), [rows]);

  /** Cria as duas pernas da transferência e vincula as linhas do extrato. */
  const registerTransfer = useCallback(async (pair: TransferPair, description?: string) => {
    setSaving(true);
    const label = description?.trim()
      || `Transferência ${pair.out.account_name} → ${pair.in.account_name}`;

    const base = {
      tax_amount: 0,
      notes: 'Transferência entre contas próprias identificada na conciliação bancária (fora do DRE).',
      created_by: user?.id ?? null,
      affects_dre: false,
      affects_cashflow: true,
    };

    const legs = [
      {
        ...base,
        type: 'despesa' as const,
        status: 'pago' as const,
        description: label,
        amount: pair.amount,
        net_amount: pair.amount,
        competence_date: pair.out.posted_at,
        due_date: pair.out.posted_at,
        payment_date: pair.out.posted_at,
        account_id: pair.out.account_id,
        entryId: pair.out.id,
      },
      {
        ...base,
        type: 'receita' as const,
        status: 'recebido' as const,
        description: label,
        amount: pair.amount,
        net_amount: pair.amount,
        competence_date: pair.in.posted_at,
        due_date: pair.in.posted_at,
        payment_date: pair.in.posted_at,
        account_id: pair.in.account_id,
        entryId: pair.in.id,
      },
    ];

    try {
      for (const { entryId, ...leg } of legs) {
        const { data, error } = await supabase
          .from('transactions')
          .insert(leg as TablesInsert<'transactions'>)
          .select('id')
          .single();
        if (error || !data) throw error ?? new Error('Falha ao criar a perna da transferência');
        const { error: linkError } = await supabase
          .from('bank_statement_entries')
          .update({
            transaction_id: data.id,
            status: 'vinculado',
            match_note: 'Transferência entre contas próprias (criada na conciliação)',
            decided_by: user?.id ?? null,
            decided_at: new Date().toISOString(),
          })
          .eq('id', entryId);
        if (linkError) throw linkError;
      }
      toast({ title: 'Transferência registrada', description: `${label} — fora do DRE, só no caixa.` });
      await load();
      return true;
    } catch (err: unknown) {
      toast({ title: 'Erro ao registrar transferência', description: errorMessage(err), variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [user, toast, load]);

  return { pairs, loading, saving, registerTransfer, reload: load };
}
