import { useEffect, useState } from 'react';
import { toLocalISODate } from '@/lib/utils';
import { callRpc } from '@/lib/rpc';

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
  /** Movimentação calculada (entradas - saídas) sem considerar saldo inicial. */
  movimentacaoCalculada: number;
  /** Alguma conta possui saldo inicial configurado? */
  saldoInicialConfigurado: boolean;
  saldoInicialTotal: number;
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
  receitaCategoryData: { name: string; value: number }[];
  loading: boolean;
  semCategoria: number;
  semCategoriaReceita: number;
  semCategoriaDespesa: number;
  semUnidade: number;
  margemContribuicao: number;
  variacaoReceita: number | null;
  variacaoDespesa: number | null;
  unitRanking: UnitRanking[];
  /** Mensagem quando alguma consulta falhou: os números exibidos NÃO são confiáveis e não devem virar zeros. */
  error: string | null;
  /** Recarregando depois de mudar filtro (os números anteriores continuam na tela). */
  refreshing: boolean;
}

export interface DashboardFilters {
  unitId?: string;
  frontId?: string;
  includeProvisioned?: boolean;
  period?: { from: string; to: string };
}

function ymd(d: Date) {
  return toLocalISODate(d);
}

/** Resposta de dashboard_summary (números como number ou string, conforme o PostgREST). */
interface SummaryBill {
  id: string; description: string; net_amount: number | string; due_date: string; type: string; partner_name: string | null;
}
interface DashboardSummary {
  movimentacaoCalculada: number | string;
  saldoInicialTotal: number | string;
  saldoInicialConfigurado: boolean;
  receitas: number | string; despesas: number | string;
  receitasProvisionadas: number | string; despesasProvisionadas: number | string;
  prevReceitas: number | string; prevDespesas: number | string;
  semCategoria: number; semCategoriaReceita: number; semCategoriaDespesa: number; semUnidade: number;
  monthly: { month: string; receitas: number | string; despesas: number | string; receitasProv: number | string; despesasProv: number | string }[];
  categoryData: { name: string; value: number | string }[];
  receitaCategoryData: { name: string; value: number | string }[];
  unitRanking: { unitId: string; unitName: string; despesas: number | string; receitas: number | string }[];
  overdueBills: SummaryBill[];
  dueTodayBills: SummaryBill[];
}

/** Mensagem em português para os erros de dashboard_summary. */
export function dashboardRpcError(error: { message: string; code?: string }): string {
  if (error.code === 'PGRST202') {
    return 'A função dashboard_summary não existe neste banco. Aplique a migração 20261008120000 (scripts/producao/11-dashboard-resumo.sql).';
  }
  if (error.message.startsWith('invalid_period')) return 'Período inválido: a data inicial deve ser anterior à final.';
  return error.message;
}

export function useDashboard(filters?: DashboardFilters) {
  const [data, setData] = useState<DashboardData>({
    saldoTotal: 0,
    movimentacaoCalculada: 0,
    saldoInicialConfigurado: false,
    saldoInicialTotal: 0,
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
    receitaCategoryData: [],
    loading: true,
    semCategoria: 0,
    semCategoriaReceita: 0,
    semCategoriaDespesa: 0,
    semUnidade: 0,
    margemContribuicao: 0,
    variacaoReceita: null,
    variacaoDespesa: null,
    unitRanking: [],
    error: null,
    refreshing: false,
  });
  const [reloadKey, setReloadKey] = useState(0);

  const periodFrom = filters?.period?.from;
  const periodTo = filters?.period?.to;

  useEffect(() => {
    // Uma resposta lenta de um filtro anterior não pode sobrescrever a do filtro atual.
    let cancelled = false;
    fetchData(() => cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.unitId, filters?.frontId, filters?.includeProvisioned, periodFrom, periodTo, reloadKey]);

  const unitFilter = filters?.unitId;
  const frontFilter = filters?.frontId;

  async function fetchData(isCancelled: () => boolean) {
    setData(prev => (prev.loading ? prev : { ...prev, refreshing: true, error: null }));
    try {
      const now = new Date();
      const today = ymd(now);
      const rangeStart = periodFrom || ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      const rangeEnd = periodTo || ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      if (rangeEnd < rangeStart) throw new Error('Período inválido: a data inicial deve ser anterior à final.');

      // Tudo é calculado no banco (dashboard_summary), com as mesmas regras de lib/finance.ts.
      const { data: s, error } = await callRpc<DashboardSummary>('dashboard_summary', {
        p_from: rangeStart,
        p_to: rangeEnd,
        p_unit: unitFilter ?? null,
        p_front: frontFilter ?? null,
        p_include_provisioned: !!filters?.includeProvisioned,
        p_today: today,
      });
      if (error || !s) throw new Error(error ? dashboardRpcError(error) : 'Resposta vazia do servidor.');
      if (isCancelled()) return;

      const incluirProv = !!filters?.includeProvisioned;
      const receitasMes = Number(s.receitas);
      const despesasMes = Number(s.despesas);
      const receitasProvisionadas = Number(s.receitasProvisionadas);
      const despesasProvisionadas = Number(s.despesasProvisionadas);
      const curReceitas = receitasMes + (incluirProv ? receitasProvisionadas : 0);
      const curDespesas = despesasMes + (incluirProv ? despesasProvisionadas : 0);
      const prevReceitas = Number(s.prevReceitas);
      const prevDespesas = Number(s.prevDespesas);
      const movimentacaoCalculada = Number(s.movimentacaoCalculada);
      const saldoInicialTotal = Number(s.saldoInicialTotal);

      const shortMonth = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthlyData = s.monthly.map((m) => {
        const [y, mo] = m.month.split('-');
        return {
          label: `${shortMonth[Number(mo) - 1]}/${y.slice(2)}`,
          receitas: Number(m.receitas), despesas: Number(m.despesas),
          receitasProv: Number(m.receitasProv), despesasProv: Number(m.despesasProv),
        };
      });
      const names = (list: { name: string; value: number | string }[]) => list.map((c) => ({ name: c.name, value: Number(c.value) }));
      const bills = (list: SummaryBill[]): OverdueBill[] => list.map((b) => ({
        id: b.id, description: b.description, net_amount: Number(b.net_amount), due_date: b.due_date,
        type: b.type, partner_name: b.partner_name ?? undefined,
      }));
      const overdueBills = bills(s.overdueBills);
      const dueTodayBills = bills(s.dueTodayBills);

      setData({
        saldoTotal: movimentacaoCalculada + saldoInicialTotal,
        movimentacaoCalculada,
        saldoInicialConfigurado: !!s.saldoInicialConfigurado,
        saldoInicialTotal,
        receitasMes, despesasMes, receitasProvisionadas, despesasProvisionadas,
        contasAtrasadas: overdueBills.length,
        vencendoHoje: dueTodayBills.length,
        overdueBills, dueTodayBills, monthlyData,
        categoryData: names(s.categoryData),
        receitaCategoryData: names(s.receitaCategoryData),
        loading: false,
        semCategoria: Number(s.semCategoria),
        semCategoriaReceita: Number(s.semCategoriaReceita),
        semCategoriaDespesa: Number(s.semCategoriaDespesa),
        semUnidade: Number(s.semUnidade),
        margemContribuicao: curReceitas - curDespesas,
        variacaoReceita: prevReceitas > 0 ? ((curReceitas - prevReceitas) / prevReceitas) * 100 : null,
        variacaoDespesa: prevDespesas > 0 ? ((curDespesas - prevDespesas) / prevDespesas) * 100 : null,
        unitRanking: s.unitRanking.map((u) => ({
          unitId: u.unitId, unitName: u.unitName, despesas: Number(u.despesas), receitas: Number(u.receitas),
        })),
        error: null, refreshing: false,
      });
    } catch (err) {
      if (isCancelled()) return;
      // Mantém os números anteriores e avisa: zeros no lugar de uma consulta que falhou enganam.
      setData(prev => ({
        ...prev, loading: false, refreshing: false,
        error: err instanceof Error ? err.message : 'Falha ao carregar o Dashboard.',
      }));
    }
  }

  return { ...data, reload: () => setReloadKey(k => k + 1) };
}
