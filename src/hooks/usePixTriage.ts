import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PixSuggestion, PixTx, detectTransferPairs, readNatureTag, suggestNature } from '@/lib/pixTriage';
import { errorMessage } from '@/lib/utils';

/**
 * Carrega os PIX que precisam de triagem de natureza (somente leitura).
 * O termo padrão é "Martinho", origem que mistura venda, remanejo e repasses.
 *
 * Além dos PIX, carrega TODOS os lançamentos do período como candidatos a
 * contrapartida: a saída correspondente costuma ter outra descrição
 * ("PIX ENVIADO DES: LETS COOKIES"), então o par só aparece se procurarmos fora
 * do termo pesquisado.
 */
export function usePixTriage(range: { from: string; to: string }, term = 'Martinho') {
  const { toast } = useToast();
  const [rows, setRows] = useState<PixTx[]>([]);
  const [candidates, setCandidates] = useState<PixTx[]>([]);
  const [accountNameById, setAccountNameById] = useState<Map<string, string>>(new Map());
  const [unitNameById, setUnitNameById] = useState<Map<string, string>>(new Map());
  const [categoryNameById, setCategoryNameById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const like = `%${term}%`;
      const cols =
        'id, description, notes, net_amount, type, account_id, unit_id, category_id, payment_date, competence_date, affects_dre, affects_cashflow, status';
      const { data, error } = await supabase
        .from('transactions')
        .select(cols)
        .or(`description.ilike.${like},notes.ilike.${like}`)
        .gte('competence_date', range.from)
        .lte('competence_date', range.to)
        .not('status', 'eq', 'cancelado')
        .order('competence_date', { ascending: true })
        .limit(2000);
      if (error) throw error;

      const { data: pool } = await supabase
        .from('transactions')
        .select(cols)
        .gte('competence_date', range.from)
        .lte('competence_date', range.to)
        .not('status', 'eq', 'cancelado')
        .eq('type', 'despesa')
        .limit(10000);

      const [{ data: accs }, { data: us }, { data: cats }] = await Promise.all([
        supabase.from('accounts').select('id, name'),
        supabase.from('units').select('id, name'),
        supabase.from('categories').select('id, name'),
      ]);
      setAccountNameById(new Map((accs ?? []).map((a) => [a.id, a.name])));
      setUnitNameById(new Map((us ?? []).map((u) => [u.id, u.name])));
      setCategoryNameById(new Map((cats ?? []).map((c) => [c.id, c.name])));
      setCandidates(
        (pool ?? []).map((t) => ({ ...t, net_amount: Number(t.net_amount) || 0 })) as PixTx[]
      );
      setRows(
        (data ?? []).map((t) => ({ ...t, net_amount: Number(t.net_amount) || 0 })) as PixTx[]
      );
    } catch (e: unknown) {
      toast({ title: 'Erro ao carregar PIX', description: errorMessage(e), variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, term, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const pairs = useMemo(() => detectTransferPairs(rows, 3, candidates), [rows, candidates]);

  /** Contrapartida completa (para exibir os dois lançamentos lado a lado). */
  const partnerById = useMemo(() => {
    const byId = new Map<string, PixTx>();
    [...rows, ...candidates].forEach((t) => byId.set(t.id, t));
    const m = new Map<string, PixTx>();
    pairs.forEach((p) => {
      const out = byId.get(p.outId);
      const inn = byId.get(p.inId);
      if (out) m.set(p.inId, out);
      if (inn) m.set(p.outId, inn);
    });
    return m;
  }, [pairs, rows, candidates]);

  const suggestions = useMemo(() => {
    const map: Record<string, PixSuggestion> = {};
    const pairIds = new Set(pairs.flatMap((p) => [p.inId, p.outId]));
    rows.forEach((t) => {
      map[t.id] = suggestNature(t, pairIds.has(t.id));
    });
    return map;
  }, [rows, pairs]);

  const classified = useMemo(() => rows.filter((t) => readNatureTag(t.notes)).length, [rows]);

  return {
    rows,
    pairs,
    partnerById,
    suggestions,
    classified,
    accountNameById,
    unitNameById,
    categoryNameById,
    loading,
    reload: load,
  };
}