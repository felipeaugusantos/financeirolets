import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OverdueBill {
  id: string;
  description: string;
  net_amount: number;
  due_date: string;
  type: string;
  partner_name?: string;
}

export interface DashboardData {
  saldoTotal: number;
  receitasMes: number;
  despesasMes: number;
  contasAtrasadas: number;
  vencendoHoje: number;
  overdueBills: OverdueBill[];
  dueTodayBills: OverdueBill[];
  monthlyData: { label: string; receitas: number; despesas: number }[];
  categoryData: { name: string; value: number }[];
  loading: boolean;
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData>({
    saldoTotal: 0,
    receitasMes: 0,
    despesasMes: 0,
    contasAtrasadas: 0,
    vencendoHoje: 0,
    overdueBills: [],
    dueTodayBills: [],
    monthlyData: [],
    categoryData: [],
    loading: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const now = new Date();
      const currentMonth = now.toISOString().substring(0, 7);
      const today = now.toISOString().substring(0, 10);

      // Last 6 months range
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const rangeStart = sixMonthsAgo.toISOString().substring(0, 10);
      const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().substring(0, 10);

      // Fetch transactions for last 6 months (paid/received)
      const { data: txs } = await supabase
        .from('transactions')
        .select('type, net_amount, payment_date, status, category_id, due_date, competence_date')
        .gte('competence_date', rangeStart)
        .lte('competence_date', rangeEnd);

      const rows = txs ?? [];

      // KPIs
      let receitasMes = 0;
      let despesasMes = 0;
      let contasAtrasadas = 0;

      // Monthly aggregation
      const monthMap = new Map<string, { receitas: number; despesas: number }>();
      // Category aggregation (despesas only, current month)
      const catMap = new Map<string, number>();

      rows.forEach((tx: any) => {
        const isPaid = tx.status === 'pago' || tx.status === 'recebido';
        const competenceMonth = tx.competence_date?.substring(0, 7);

        // Monthly chart (paid/received only)
        if (isPaid && tx.payment_date) {
          const payMonth = tx.payment_date.substring(0, 7);
          const entry = monthMap.get(payMonth) || { receitas: 0, despesas: 0 };
          const val = Number(tx.net_amount) || 0;
          if (tx.type === 'receita') entry.receitas += val;
          else entry.despesas += val;
          monthMap.set(payMonth, entry);
        }

        // Current month KPIs
        if (competenceMonth === currentMonth && isPaid) {
          const val = Number(tx.net_amount) || 0;
          if (tx.type === 'receita') receitasMes += val;
          else despesasMes += val;
        }

        // Overdue
        if (tx.status === 'pendente' && tx.due_date && tx.due_date < today) {
          contasAtrasadas++;
        }

        // Category breakdown (current month despesas)
        if (tx.type === 'despesa' && competenceMonth === currentMonth && isPaid) {
          const catId = tx.category_id || 'sem-categoria';
          catMap.set(catId, (catMap.get(catId) || 0) + (Number(tx.net_amount) || 0));
        }
      });

      // Build monthly array
      const shortMonth = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthlyData: { label: string; receitas: number; despesas: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const key = d.toISOString().substring(0, 7);
        const entry = monthMap.get(key) || { receitas: 0, despesas: 0 };
        monthlyData.push({
          label: `${shortMonth[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
          receitas: entry.receitas,
          despesas: entry.despesas,
        });
      }

      // Fetch category names for pie chart
      let categoryData: { name: string; value: number }[] = [];
      if (catMap.size > 0) {
        const catIds = Array.from(catMap.keys()).filter(id => id !== 'sem-categoria');
        if (catIds.length > 0) {
          const { data: cats } = await supabase.from('categories').select('id, name').in('id', catIds);
          const nameMap = new Map((cats ?? []).map((c: any) => [c.id, c.name]));
          categoryData = Array.from(catMap.entries()).map(([id, value]) => ({
            name: id === 'sem-categoria' ? 'Sem Categoria' : (nameMap.get(id) || 'Outro'),
            value,
          }));
        }
      }

      // Saldo total = all-time receitas - despesas (paid)
      const { data: allTxs } = await supabase
        .from('transactions')
        .select('type, net_amount, status')
        .in('status', ['pago', 'recebido'] as any);

      let saldoTotal = 0;
      (allTxs ?? []).forEach((tx: any) => {
        const val = Number(tx.net_amount) || 0;
        saldoTotal += tx.type === 'receita' ? val : -val;
      });

      // Add account initial balances
      const { data: accounts } = await supabase.from('accounts').select('initial_balance');
      (accounts ?? []).forEach((a: any) => {
        saldoTotal += Number(a.initial_balance) || 0;
      });

      // Fetch overdue & due-today bills for alerts
      const { data: alertBills } = await supabase
        .from('transactions')
        .select('id, description, net_amount, due_date, type, partner:partners(name)')
        .in('status', ['pendente', 'agendado'] as any)
        .not('due_date', 'is', null)
        .lte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(20);

      const overdueBills: OverdueBill[] = [];
      const dueTodayBills: OverdueBill[] = [];
      let vencendoHoje = 0;
      (alertBills ?? []).forEach((b: any) => {
        const bill: OverdueBill = {
          id: b.id, description: b.description, net_amount: b.net_amount,
          due_date: b.due_date, type: b.type, partner_name: b.partner?.name,
        };
        if (b.due_date === today) { dueTodayBills.push(bill); vencendoHoje++; }
        else overdueBills.push(bill);
      });

      setData({
        saldoTotal,
        receitasMes,
        despesasMes,
        contasAtrasadas,
        vencendoHoje,
        overdueBills,
        dueTodayBills,
        monthlyData,
        categoryData,
        loading: false,
      });
    } catch {
      setData(prev => ({ ...prev, loading: false }));
    }
  }

  return data;
}
