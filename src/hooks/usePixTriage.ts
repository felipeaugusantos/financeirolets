import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PixTx, detectTransferPairs, readNatureTag, suggestNature } from '@/lib/pixTriage';

/**
 * Carrega os PIX que precisam de triagem de natureza (somente leitura).
 * O termo padrão é "Martinho", origem que mistura venda, remanejo e repasses.
 */
export function usePixTriage(range: { from: string; to: string }, term = 'Martinho') {
  const { toast } = useToast();
  const [rows, setRows] = useState<PixTx[]>([]);
  const [accountNameById, setAccountNameById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const like = `%${term}%`;
      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, description, notes, net_amount, type, account_id, payment_date, competence_date, affects_dre, affects_cashflow, status'
        )
        .or(`description.ilike.${like},notes.ilike.${like}`)
        .gte('competence_date', range.from)
        .lte('competence_date', range.to)
        .not('status', 'eq', 'cancelado')
        .order('competence_date', { ascending: true })
        .limit(2000);
      if (error) throw error;

      const { data: accs } = await supabase.from('accounts').select('id, name');
      setAccountNameById(new Map((accs ?? []).map((a: any) => [a.id, a.name])));
      setRows(
        (data ?? []).map((t: any) => ({ ...t, net_amount: Number(t.net_amount) || 0 })) as PixTx[]
      );
    } catch (e: any) {
      toast({ title: 'Erro ao carregar PIX', description: e.message, variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, term, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const pairs = useMemo(() => detectTransferPairs(rows), [rows]);

  const suggestions = useMemo(() => {
    const map: Record<string, { nature: ReturnType<typeof suggestNature>['nature']; reason: string }> = {};
    const pairIds = new Set(pairs.flatMap((p) => [p.inId, p.outId]));
    rows.forEach((t) => {
      if (pairIds.has(t.id) && !readNatureTag(t.notes)) {
        map[t.id] = { nature: 'transferencia', reason: 'Par de entrada/saída de mesmo valor em contas diferentes.' };
        return;
      }
      map[t.id] = suggestNature(t);
    });
    return map;
  }, [rows, pairs]);

  const classified = useMemo(() => rows.filter((t) => readNatureTag(t.notes)).length, [rows]);

  return { rows, pairs, suggestions, classified, accountNameById, loading, reload: load };
}