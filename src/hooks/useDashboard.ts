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

export interface UnitRanking {
  unitId: string;
  unitName: string;
  despesas: number;
  receitas: number;
}

export interface DashboardData {
  saldoTotal: number;
  receitasMes: number;
  despesasMes: number;
  receitasProvisionadas: number;
  despesasProvisionadas: number;
  contasAtrasadas: number;
  vencendoHoje: number;
  overdueBills: OverdueBill[];
  dueTodayBills: OverdueBill[];
  monthlyData: { label: string; receitas: number; despesas: number; receitasProv: number; despesasProv: number }[];
  categoryData: { name: string; value: number }[];
  loading: boolean;
  semCategoria: number;
  semUnidade: number;
  margemContribuicao: number;
  variacaoReceita: number | null;
  variacaoDespesa: number | null;
  unitRanking: UnitRanking[];
}

export interface DashboardFilters {
  unitId?: string;
  frontId?: string;
  includeProvisioned?: boolean;
}

export function useDashboard(filters?: DashboardFilters) {
  const [data, setData] = useState<DashboardData>({
    saldoTotal: 0,
    receitasMes: 0,
    despesasMes: 0,
    receitasProvisionadas: 0,
    despesasProvisionadas: 0,
    contasAtrasadas: 0,
    vencendoHoje: 0,
    overdueBills: [],
    dueTodayBills: [],
    monthlyData: [],
    categoryData: [],
    loading: true,
    semCategoria: 0,
    semUnidade: 0,
    margemContribuicao: 0,
    variacaoReceita: null,
    variacaoDespesa: null,
    unitRanking: [],
  });

  useEffect(() => {
    fetchData();
  }, [filters?.unitId, filters?.frontId, filters?.includeProvisioned]);

  function applyFilters(query: any) {
    if (filters?.unitId) query = query.eq('unit_id', filters.unitId);
    if (filters?.frontId) query = query.eq('front_id', filters.frontId);
    return query;
  }

  async function fetchData() {
    try {
      const now = new Date();
      const currentMonth = now.toISOString().substring(0, 7);
      const today = now.toISOString().substring(0, 10);

      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const rangeStart = sixMonthsAgo.toISOString().substring(0, 10);
      const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().substring(0, 10);

      // Fetch transactions for last 6 months
      let txQuery = supabase
        .from('transactions')
        .select('type, net_amount, payment_date, status, category_id, due_date, competence_date, unit_id')
        .or(`and(competence_date.gte.${rangeStart},competence_date.lte.${rangeEnd}),and(payment_date.gte.${rangeStart},payment_date.lte.${rangeEnd})`)
        .not('status', 'eq', 'cancelado')
        .limit(10000);
      txQuery = applyFilters(txQuery);
      const { data: txs } = await txQuery;
      if (txs && txs.length >= 10000) {
        console.warn('[useDashboard] Possível truncamento: 10.000 transações retornadas em', { rangeStart, rangeEnd });
      }

      const rows = txs ?? [];

      let receitasMes = 0;
      let despesasMes = 0;
      let receitasProvisionadas = 0;
      let despesasProvisionadas = 0;
      let contasAtrasadas = 0;
      let semCategoria = 0;
      let semUnidade = 0;
      let despesasVariaveisMes = 0;

      const monthMap = new Map<string, { receitas: number; despesas: number; receitasProv: number; despesasProv: number }>();
      const catMap = new Map<string, number>();
      const catProvMap = new Map<string, number>();

      rows.forEach((tx: any) => {
        const isPaid = tx.status === 'pago' || tx.status === 'recebido';
        const isProvisioned = tx.status === 'pendente' || tx.status === 'agendado';
        const competenceMonth = tx.competence_date?.substring(0, 7);

        // Count incomplete data
        if (tx.status !== 'cancelado') {
          if (!tx.category_id) semCategoria++;
          if (!tx.unit_id) semUnidade++;
        }

        if (isPaid && tx.payment_date) {
          const payMonth = tx.payment_date.substring(0, 7);
          const entry = monthMap.get(payMonth) || { receitas: 0, despesas: 0, receitasProv: 0, despesasProv: 0 };
          const val = Number(tx.net_amount) || 0;
          if (tx.type === 'receita') entry.receitas += val;
          else entry.despesas += val;
          monthMap.set(payMonth, entry);
        }

        if (isProvisioned && competenceMonth) {
          const entry = monthMap.get(competenceMonth) || { receitas: 0, despesas: 0, receitasProv: 0, despesasProv: 0 };
          const val = Number(tx.net_amount) || 0;
          if (tx.type === 'receita') entry.receitasProv += val;
          else entry.despesasProv += val;
          monthMap.set(competenceMonth, entry);
        }

        if (competenceMonth === currentMonth && isPaid) {
          const val = Number(tx.net_amount) || 0;
          if (tx.type === 'receita') receitasMes += val;
          else despesasMes += val;
        }

        if (competenceMonth === currentMonth && isProvisioned) {
          const val = Number(tx.net_amount) || 0;
          if (tx.type === 'receita') receitasProvisionadas += val;
          else despesasProvisionadas += val;
        }

        if ((tx.status === 'pendente' || tx.status === 'agendado') && tx.due_date && tx.due_date < today) {
          contasAtrasadas++;
        }

        if (tx.type === 'despesa' && competenceMonth === currentMonth && isPaid) {
          const catId = tx.category_id || 'sem-categoria';
          catMap.set(catId, (catMap.get(catId) || 0) + (Number(tx.net_amount) || 0));
        }
        if (tx.type === 'despesa' && competenceMonth === currentMonth && isProvisioned) {
          const catId = tx.category_id || 'sem-categoria';
          catProvMap.set(catId, (catProvMap.get(catId) || 0) + (Number(tx.net_amount) || 0));
        }
      });

      // If including provisioned, merge provisioned categories into catMap
      if (filters?.includeProvisioned) {
        catProvMap.forEach((v, k) => catMap.set(k, (catMap.get(k) || 0) + v));
      }

      // Build monthly array
      const shortMonth = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthlyData: { label: string; receitas: number; despesas: number; receitasProv: number; despesasProv: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const key = d.toISOString().substring(0, 7);
        const entry = monthMap.get(key) || { receitas: 0, despesas: 0, receitasProv: 0, despesasProv: 0 };
        monthlyData.push({
          label: `${shortMonth[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
          receitas: entry.receitas,
          despesas: entry.despesas,
          receitasProv: entry.receitasProv,
          despesasProv: entry.despesasProv,
        });
      }

      // Category names
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

      // Saldo total (all-time paid transactions)
      let saldoQuery = supabase
        .from('transactions')
        .select('type, net_amount, status')
        .in('status', ['pago', 'recebido'] as any)
        .limit(10000);
      saldoQuery = applyFilters(saldoQuery);
      const { data: allTxs } = await saldoQuery;
      if (allTxs && allTxs.length >= 10000) {
        console.warn('[useDashboard] Possível truncamento no saldoTotal: 10.000 transações retornadas');
      }

      let saldoTotal = 0;
      (allTxs ?? []).forEach((tx: any) => {
        const val = Number(tx.net_amount) || 0;
        saldoTotal += tx.type === 'receita' ? val : -val;
      });

      // Add account initial balances (only when no unit/front filter)
      if (!filters?.unitId && !filters?.frontId) {
        const { data: accounts } = await supabase.from('accounts').select('initial_balance');
        (accounts ?? []).forEach((a: any) => {
          saldoTotal += Number(a.initial_balance) || 0;
        });
      }

      // Overdue & due-today alerts
      let alertQuery = supabase
        .from('transactions')
        .select('id, description, net_amount, due_date, type, partner:partners(name)')
        .in('status', ['pendente', 'agendado'] as any)
        .not('due_date', 'is', null)
        .lte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(100);
      alertQuery = applyFilters(alertQuery);
      const { data: alertBills } = await alertQuery;

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

      // Month-over-month variation
      const prevMonthKey = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().substring(0, 7);
      const prevEntry = monthMap.get(prevMonthKey);
      const curEntry = monthMap.get(currentMonth);
      const variacaoReceita = prevEntry && prevEntry.receitas > 0 && curEntry
        ? ((curEntry.receitas - prevEntry.receitas) / prevEntry.receitas) * 100
        : null;
      const variacaoDespesa = prevEntry && prevEntry.despesas > 0 && curEntry
        ? ((curEntry.despesas - prevEntry.despesas) / prevEntry.despesas) * 100
        : null;

      // Margem (inclui provisionados se ativado)
      const incluirProv = !!filters?.includeProvisioned;
      const recTot = receitasMes + (incluirProv ? receitasProvisionadas : 0);
      const despTot = despesasMes + (incluirProv ? despesasProvisionadas : 0);
      const margemContribuicao = recTot - despTot;

      // Unit ranking - despesas por unidade no mês atual
      const unitDespMap = new Map<string, { despesas: number; receitas: number }>();
      rows.forEach((tx: any) => {
        const isPaid = tx.status === 'pago' || tx.status === 'recebido';
        const isProvisioned = tx.status === 'pendente' || tx.status === 'agendado';
        const include = isPaid || (incluirProv && isProvisioned);
        const competenceMonth = tx.competence_date?.substring(0, 7);
        if (include && competenceMonth === currentMonth && tx.unit_id) {
          const entry = unitDespMap.get(tx.unit_id) || { despesas: 0, receitas: 0 };
          const val = Number(tx.net_amount) || 0;
          if (tx.type === 'despesa') entry.despesas += val;
          else entry.receitas += val;
          unitDespMap.set(tx.unit_id, entry);
        }
      });

      let unitRanking: UnitRanking[] = [];
      if (unitDespMap.size > 0) {
        const unitIds = Array.from(unitDespMap.keys());
        const { data: unitRows } = await supabase.from('units').select('id, name').in('id', unitIds);
        const nameMap = new Map((unitRows ?? []).map((u: any) => [u.id, u.name]));
        unitRanking = Array.from(unitDespMap.entries())
          .map(([id, v]) => ({ unitId: id, unitName: nameMap.get(id) || 'Desconhecida', despesas: v.despesas, receitas: v.receitas }))
          .sort((a, b) => b.despesas - a.despesas);
      }

      setData({
        saldoTotal, receitasMes, despesasMes, receitasProvisionadas, despesasProvisionadas,
        contasAtrasadas, vencendoHoje,
        overdueBills, dueTodayBills, monthlyData, categoryData, loading: false,
        semCategoria, semUnidade, margemContribuicao, variacaoReceita, variacaoDespesa,
        unitRanking,
      });
    } catch {
      setData(prev => ({ ...prev, loading: false }));
    }
  }

  return data;
}
