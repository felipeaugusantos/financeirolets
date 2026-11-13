import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { findInternalTransfers, TransferCandidateEntry, TransferPair } from '@/lib/internalTransfers';
import { errorMessage } from '@/lib/utils';

/** Pending mirror entries are suggestions only; confirmation commits both cash legs atomically. */
export function useInternalTransfers(from: string, to: string, accountId: string, revision: unknown) {
  const { toast } = useToast();
  const [rows, setRows] = useState<TransferCandidateEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: TransferCandidateEntry[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('bank_statement_entries')
          .select('id, account_id, posted_at, amount, memo, status, account:accounts(name)')
          .eq('status', 'pendente').is('transaction_id', null)
          .gte('posted_at', from).lte('posted_at', to).order('id').range(offset, offset + 499);
        if (result.error) throw result.error;
        const data = result.data ?? [];
        all.push(...data.map(r => ({ id: r.id, account_id: r.account_id,
          account_name: r.account?.name ?? 'Conta', posted_at: r.posted_at,
          amount: Number(r.amount), memo: r.memo ?? '', status: r.status })));
        if (data.length < 500) break;
      }
      setRows(all);
    } catch (err) { setRows([]); setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load, revision]);
  const pairs = useMemo(() => findInternalTransfers(rows).filter(p =>
    p.out.account_id === accountId || p.in.account_id === accountId), [rows, accountId]);
  const registerTransfer = useCallback(async (pair: TransferPair) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('register_internal_transfer', {
        p_out_entry: pair.out.id, p_in_entry: pair.in.id,
      });
      if (error) throw error;
      toast({ title: 'Transferência confirmada', description: 'As duas contas foram conciliadas; movimentação fora do DRE.' });
      await load();
      return true;
    } catch (err) {
      toast({ title: 'Transferência não registrada', description: errorMessage(err), variant: 'destructive' });
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  }, [toast, load]);
  return { pairs, loading, saving, error, registerTransfer, reload: load };
}
