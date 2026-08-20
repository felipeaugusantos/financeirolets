import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fotografia do período direto do banco: DRE (competência) e Caixa (pagamento).
 * Serve de trava — se uma classificação de natureza mexer no caixa, aparece aqui.
 */
export interface FinanceSnapshot {
  receita: number;
  despesa: number;
  resultado: number;
  entradas: number;
  saidas: number;
  liquido: number;
}

export const EMPTY_SNAPSHOT: FinanceSnapshot = {
  receita: 0,
  despesa: 0,
  resultado: 0,
  entradas: 0,
  saidas: 0,
  liquido: 0,
};

export function useFinanceSnapshot(range: { from: string; to: string }) {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sel = (s: string): string => s;
      const [dre, cash] = await Promise.all([
        supabase
          .from('transactions')
          .select(sel('type, net_amount'))
          .gte('competence_date', range.from)
          .lte('competence_date', range.to)
          .not('status', 'eq', 'cancelado')
          .eq('affects_dre', true)
          .limit(20000),
        supabase
          .from('transactions')
          .select(sel('type, net_amount'))
          .gte('payment_date', range.from)
          .lte('payment_date', range.to)
          .in('status', ['pago', 'recebido'])
          .eq('affects_cashflow', true)
          .limit(20000),
      ]);

      const sum = (rows: any[] | null, kind: string) =>
        (rows ?? []).reduce(
          (s, r) => (r.type === kind ? s + (Number(r.net_amount) || 0) : s),
          0
        );

      const receita = sum(dre.data as any[], 'receita');
      const despesa = sum(dre.data as any[], 'despesa');
      const entradas = sum(cash.data as any[], 'receita');
      const saidas = sum(cash.data as any[], 'despesa');
      setSnapshot({
        receita,
        despesa,
        resultado: receita - despesa,
        entradas,
        saidas,
        liquido: entradas - saidas,
      });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  return { snapshot, loading, reload: load };
}