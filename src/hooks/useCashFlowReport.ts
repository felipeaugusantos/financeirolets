import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toLocalISODate } from '@/lib/utils';

export interface CashFlowMonth {
  month: string; // YYYY-MM
  label: string; // "Jan/26"
  receitas: number;
  despesas: number;
  saldo: number;
  acumulado: number;
}

export interface CashFlowFilters {
  dateFrom: string;
  dateTo: string;
  unit_id?: string;
  category_id?: string;
}

export function useCashFlowReport() {
  const [data, setData] = useState<CashFlowMonth[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generate = useCallback(async (filters: CashFlowFilters) => {
    setLoading(true);
    try {
      let query = supabase
        .from('transactions')
        .select('id, type, net_amount, payment_date, status, unit_id, category_id')
        .not('payment_date', 'is', null)
        .in('status', ['pago', 'recebido'] as any)
        .eq('affects_cashflow', true)
        .gte('payment_date', filters.dateFrom)
        .lte('payment_date', filters.dateTo);

      if (filters.category_id) {
        query = (filters.category_id === '__none__' || filters.category_id === '__null__')
          ? query.is('category_id', null)
          : query.eq('category_id', filters.category_id);
      }
      if (filters.unit_id === '__none__') {
        query = query.is('unit_id', null);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      // Fetch allocations if filtering by unit
      let allocMap = new Map<string, { unit_id: string | null; percentage: number; amount: number | null; allocation_type: string }[]>();
      const isUnitFilterReal = filters.unit_id && filters.unit_id !== '__none__';
      const needsAllocs = (filters.unit_id) && rows && rows.length > 0;
      if (needsAllocs) {
        const txIds = rows.map((r: any) => r.id);
        const { data: allocs } = await supabase
          .from('transaction_allocations')
          .select('transaction_id, unit_id, allocation_type, percentage, amount')
          .in('transaction_id', txIds);
        (allocs ?? []).forEach((a: any) => {
          const list = allocMap.get(a.transaction_id) || [];
          list.push(a);
          allocMap.set(a.transaction_id, list);
        });
      }

      // Group by month
      const monthMap = new Map<string, { receitas: number; despesas: number }>();

      (rows ?? []).forEach((tx: any) => {
        const m = tx.payment_date.substring(0, 7);
        const entry = monthMap.get(m) || { receitas: 0, despesas: 0 };
        const totalVal = Number(tx.net_amount) || 0;

        let val = totalVal;
        if (filters.unit_id === '__none__') {
          // Already filtered to unit_id IS NULL; also exclude those with allocations to any unit
          const allocs = allocMap.get(tx.id);
          if (allocs && allocs.length > 0) val = 0;
        } else if (isUnitFilterReal) {
          const allocs = allocMap.get(tx.id);
          if (allocs && allocs.length > 0) {
            const unitAlloc = allocs.find(a => a.unit_id === filters.unit_id);
            if (unitAlloc) {
              val = unitAlloc.allocation_type === 'percentual' && unitAlloc.percentage
                ? totalVal * (unitAlloc.percentage / 100)
                : Number(unitAlloc.amount) || 0;
            } else {
              val = 0; // not allocated to this unit
            }
          } else if (tx.unit_id !== filters.unit_id) {
            val = 0;
          }
        }

        if (val > 0) {
          if (tx.type === 'receita') entry.receitas += val;
          else entry.despesas += val;
          monthMap.set(m, entry);
        }
      });

      // Fill missing months in range
      const start = new Date(filters.dateFrom + 'T12:00:00');
      const end = new Date(filters.dateTo + 'T12:00:00');
      const months: string[] = [];
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        months.push(toLocalISODate(cur).substring(0, 7));
        cur.setMonth(cur.getMonth() + 1);
      }

      const shortMonth = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      let acumulado = 0;

      const result: CashFlowMonth[] = months.map(m => {
        const entry = monthMap.get(m) || { receitas: 0, despesas: 0 };
        const saldo = entry.receitas - entry.despesas;
        acumulado += saldo;
        const [y, mo] = m.split('-');
        return {
          month: m,
          label: `${shortMonth[Number(mo) - 1]}/${y.slice(2)}`,
          receitas: entry.receitas,
          despesas: entry.despesas,
          saldo,
          acumulado,
        };
      });

      setData(result);
    } catch (err: any) {
      toast({ title: 'Erro ao gerar fluxo de caixa', description: err.message, variant: 'destructive' });
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { data, loading, generate };
}
