import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toLocalISODate, errorMessage } from '@/lib/utils';
import {
  applyCashRealizedBase,
  applyCashProjectedBase,
  applyCategoryFilter,
  buildAllocationMap,
  valueForUnitFilter,
  type AllocationRow,
} from '@/lib/finance';

export interface CashFlowProjectedMonth {
  month: string;
  label: string;
  receitasRealizadas: number;
  despesasRealizadas: number;
  receitasProjetadas: number;
  despesasProjetadas: number;
  saldoRealizado: number;
  saldoProjetado: number;
  saldoTotal: number;
  acumulado: number;
}

export interface ProjectedFilters {
  dateFrom: string;
  dateTo: string;
  unit_id?: string;
  category_id?: string;
}

export function useCashFlowProjected() {
  const [data, setData] = useState<CashFlowProjectedMonth[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generate = useCallback(async (filters: ProjectedFilters) => {
    setLoading(true);
    try {
      // Realizado: paid by payment_date
      let realizedQ = supabase
        .from('transactions')
        .select('id, type, net_amount, payment_date, unit_id, category_id')
        .gte('payment_date', filters.dateFrom)
        .lte('payment_date', filters.dateTo)
        .limit(10000);
      realizedQ = applyCashRealizedBase(realizedQ);

      // Projetado: pending/scheduled by due_date
      let projectedQ = supabase
        .from('transactions')
        .select('id, type, net_amount, due_date, unit_id, category_id')
        .gte('due_date', filters.dateFrom)
        .lte('due_date', filters.dateTo)
        .limit(10000);
      projectedQ = applyCashProjectedBase(projectedQ);

      realizedQ = applyCategoryFilter(realizedQ, filters.category_id);
      projectedQ = applyCategoryFilter(projectedQ, filters.category_id);
      // Unidade é resolvida no cliente para respeitar rateios.

      const [{ data: realized, error: e1 }, { data: projected, error: e2 }] = await Promise.all([
        realizedQ,
        projectedQ,
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      // Allocations
      const allTxIds = [...(realized ?? []), ...(projected ?? [])].map((t) => t.id);
      let allocMap = new Map<string, AllocationRow[]>();
      if (filters.unit_id && allTxIds.length) {
        const { data: allocs } = await supabase
          .from('transaction_allocations')
          .select('transaction_id, unit_id, allocation_type, percentage, amount')
          .in('transaction_id', allTxIds);
        allocMap = buildAllocationMap(allocs);
      }

      const valueForUnit = (tx: any): number => valueForUnitFilter(tx, allocMap, filters.unit_id);

      const monthMap = new Map<string, CashFlowProjectedMonth>();
      const ensure = (key: string, label: string): CashFlowProjectedMonth => {
        let m = monthMap.get(key);
        if (!m) {
          m = {
            month: key,
            label,
            receitasRealizadas: 0,
            despesasRealizadas: 0,
            receitasProjetadas: 0,
            despesasProjetadas: 0,
            saldoRealizado: 0,
            saldoProjetado: 0,
            saldoTotal: 0,
            acumulado: 0,
          };
          monthMap.set(key, m);
        }
        return m;
      };

      const shortMonth = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const labelOf = (key: string) => {
        const [y, mo] = key.split('-');
        return `${shortMonth[Number(mo) - 1]}/${y.slice(2)}`;
      };

      (realized ?? []).forEach((tx) => {
        const v = valueForUnit(tx);
        if (v === 0) return;
        const k = tx.payment_date.substring(0, 7);
        const m = ensure(k, labelOf(k));
        if (tx.type === 'receita') m.receitasRealizadas += v;
        else m.despesasRealizadas += v;
      });

      (projected ?? []).forEach((tx) => {
        const v = valueForUnit(tx);
        if (v === 0) return;
        const k = tx.due_date.substring(0, 7);
        const m = ensure(k, labelOf(k));
        if (tx.type === 'receita') m.receitasProjetadas += v;
        else m.despesasProjetadas += v;
      });

      // Fill missing months
      const start = new Date(filters.dateFrom + 'T12:00:00');
      const end = new Date(filters.dateTo + 'T12:00:00');
      const months: string[] = [];
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        months.push(toLocalISODate(cur).substring(0, 7));
        cur.setMonth(cur.getMonth() + 1);
      }

      let acumulado = 0;
      const result: CashFlowProjectedMonth[] = months.map(k => {
        const m = ensure(k, labelOf(k));
        m.saldoRealizado = m.receitasRealizadas - m.despesasRealizadas;
        m.saldoProjetado = m.receitasProjetadas - m.despesasProjetadas;
        m.saldoTotal = m.saldoRealizado + m.saldoProjetado;
        acumulado += m.saldoTotal;
        m.acumulado = acumulado;
        return m;
      });

      setData(result);
    } catch (err: unknown) {
      toast({ title: 'Erro ao gerar projeção', description: errorMessage(err), variant: 'destructive' });
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { data, loading, generate };
}
