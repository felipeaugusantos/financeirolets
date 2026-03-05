import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
        .select('type, net_amount, payment_date, status')
        .not('payment_date', 'is', null)
        .in('status', ['pago', 'recebido'] as any)
        .gte('payment_date', filters.dateFrom)
        .lte('payment_date', filters.dateTo);

      if (filters.unit_id) query = query.eq('unit_id', filters.unit_id);

      const { data: rows, error } = await query;
      if (error) throw error;

      // Group by month
      const monthMap = new Map<string, { receitas: number; despesas: number }>();

      (rows ?? []).forEach((tx: any) => {
        const m = tx.payment_date.substring(0, 7); // YYYY-MM
        const entry = monthMap.get(m) || { receitas: 0, despesas: 0 };
        const val = Number(tx.net_amount) || 0;
        if (tx.type === 'receita') entry.receitas += val;
        else entry.despesas += val;
        monthMap.set(m, entry);
      });

      // Fill missing months in range
      const start = new Date(filters.dateFrom + 'T00:00:00');
      const end = new Date(filters.dateTo + 'T00:00:00');
      const months: string[] = [];
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        months.push(cur.toISOString().substring(0, 7));
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
