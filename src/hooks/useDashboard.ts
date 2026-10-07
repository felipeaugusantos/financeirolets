import { useEffect, useState } from 'react';
import { toLocalISODate } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  buildAllocationMap,
  splitByUnit,
  txValue,
  valueForFilters,
  NO_UNIT_KEY,
  buildOpeningMap,
  openingBalanceTotal,
  hasOpeningBalance,
  isAfterOpening,
  type AllocationRow,
} from '@/lib/finance';
import type { Database } from '@/integrations/supabase/types';

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

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

function diffDays(fromIso: string, toIso: string) {
  const a = new Date(fromIso + 'T12:00:00');
  const b = new Date(toIso + 'T12:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const PAGE = 1000;
const ALLOC_CHUNK = 150;

interface PageResult<T> { data: T[] | null; error: { message: string } | null }

/**
 * Lê TODAS as linhas de uma consulta em páginas de 1.000 (o limite padrão de resposta do Supabase),
 * em vez de um único `limit(10000)` que trunca sem avisar. Qualquer erro vira exceção: o painel
 * nunca mostra zeros no lugar de uma consulta que falhou.
 */
export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Rateios dos lançamentos, em lotes (uma lista enorme de ids estoura o tamanho da URL). */
async function fetchAllocations(ids: string[]): Promise<AllocationRow[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ALLOC_CHUNK) chunks.push(ids.slice(i, i + ALLOC_CHUNK));
  const parts = await Promise.all(chunks.map((chunk) =>
    fetchAllPages<AllocationRow>((from, to) =>
      supabase
        .from('transaction_allocations')
        .select('id, transaction_id, unit_id, front_id, allocation_type, percentage, amount')
        .in('transaction_id', chunk)
        .order('id')
        .range(from, to) as unknown as PromiseLike<PageResult<AllocationRow>>
    )
  ));
  return parts.flat();
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

      // Resolve period (default = current month)
      const defaultFrom = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      const defaultTo = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const rangeStart = periodFrom || defaultFrom;
      const rangeEnd = periodTo || defaultTo;

      // Previous period of same length (for variation)
      const periodDays = diffDays(rangeStart, rangeEnd) + 1;
      const prevStartDate = new Date(rangeStart + 'T12:00:00');
      prevStartDate.setDate(prevStartDate.getDate() - periodDays);
      const prevEndDate = new Date(rangeStart + 'T12:00:00');
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevStart = ymd(prevStartDate);
      const prevEnd = ymd(prevEndDate);

      // Fetch transactions in [prevStart..rangeEnd] so we can compute variation in one query
      const queryStart = prevStart;
      const queryEnd = rangeEnd;

      const rows = await fetchAllPages((from, to) =>
        supabase
          .from('transactions')
          .select('id, type, net_amount, payment_date, status, category_id, due_date, competence_date, unit_id, front_id, affects_dre, affects_cashflow')
          .or(`and(competence_date.gte.${queryStart},competence_date.lte.${queryEnd}),and(payment_date.gte.${queryStart},payment_date.lte.${queryEnd})`)
          .not('status', 'eq', 'cancelado')
          .order('id')
          .range(from, to)
      );

      // Rateios: sempre (o ranking por unidade também precisa deles, não só o filtro de unidade).
      const allocMap = buildAllocationMap(await fetchAllocations(rows.map((r) => r.id)));

      /** Valor do lançamento atribuível aos filtros atuais (rateio-aware). */
      const filteredValue = (tx: Parameters<typeof valueForFilters>[0]): number =>
        valueForFilters(tx, allocMap, unitFilter, frontFilter);

      let receitasMes = 0;
      let despesasMes = 0;
      let receitasProvisionadas = 0;
      let despesasProvisionadas = 0;
      let semCategoria = 0;
      let semCategoriaReceita = 0;
      let semCategoriaDespesa = 0;
      let semUnidade = 0;

      let prevReceitas = 0;
      let prevDespesas = 0;

      const monthMap = new Map<string, { receitas: number; despesas: number; receitasProv: number; despesasProv: number }>();
      const catMap = new Map<string, number>();
      const catProvMap = new Map<string, number>();
      const recCatMap = new Map<string, number>();
      const recCatProvMap = new Map<string, number>();

      const inRange = (d: string | null | undefined, s: string, e: string) =>
        !!d && d >= s && d <= e;

      rows.forEach((tx) => {
        const isPaid = tx.status === 'pago' || tx.status === 'recebido';
        const isProvisioned = tx.status === 'pendente' || tx.status === 'agendado';
        const val = filteredValue(tx);
        if (val === 0 && (unitFilter || frontFilter)) return;
        const affectsCash = tx.affects_cashflow !== false;
        const affectsDre = tx.affects_dre !== false;

        const paidInPeriod = isPaid && affectsCash && inRange(tx.payment_date, rangeStart, rangeEnd);
        const provInPeriod = isProvisioned && affectsDre && inRange(tx.competence_date, rangeStart, rangeEnd);
        const paidInPrev = isPaid && affectsCash && inRange(tx.payment_date, prevStart, prevEnd);
        const provInPrev = isProvisioned && affectsDre && inRange(tx.competence_date, prevStart, prevEnd);

        // Incomplete data: count only items relevant to current range
        if (tx.status !== 'cancelado' && (paidInPeriod || provInPeriod)) {
          if (!tx.category_id) {
            semCategoria++;
            if (tx.type === 'receita') semCategoriaReceita++;
            else semCategoriaDespesa++;
          }
          if (!tx.unit_id && !(allocMap.get(tx.id) ?? []).some((a) => a.unit_id)) semUnidade++;
        }

        // Monthly buckets (paid by payment_date, prov by competence_date) within current range
        if (paidInPeriod) {
          const key = tx.payment_date.substring(0, 7);
          const entry = monthMap.get(key) || { receitas: 0, despesas: 0, receitasProv: 0, despesasProv: 0 };
          if (tx.type === 'receita') entry.receitas += val;
          else entry.despesas += val;
          monthMap.set(key, entry);
        }
        if (provInPeriod) {
          const key = tx.competence_date.substring(0, 7);
          const entry = monthMap.get(key) || { receitas: 0, despesas: 0, receitasProv: 0, despesasProv: 0 };
          if (tx.type === 'receita') entry.receitasProv += val;
          else entry.despesasProv += val;
          monthMap.set(key, entry);
        }

        // KPIs do período
        if (paidInPeriod) {
          if (tx.type === 'receita') receitasMes += val;
          else despesasMes += val;
        }
        if (provInPeriod) {
          if (tx.type === 'receita') receitasProvisionadas += val;
          else despesasProvisionadas += val;
        }

        // Período anterior (variação)
        if (paidInPrev) {
          if (tx.type === 'receita') prevReceitas += val;
          else prevDespesas += val;
        }
        if (provInPrev && filters?.includeProvisioned) {
          if (tx.type === 'receita') prevReceitas += val;
          else prevDespesas += val;
        }

        // Categorias (despesas e receitas) — período inteiro
        if (tx.type === 'despesa' && paidInPeriod) {
          const catId = tx.category_id || 'sem-categoria';
          catMap.set(catId, (catMap.get(catId) || 0) + val);
        }
        if (tx.type === 'despesa' && provInPeriod) {
          const catId = tx.category_id || 'sem-categoria';
          catProvMap.set(catId, (catProvMap.get(catId) || 0) + val);
        }
        if (tx.type === 'receita' && paidInPeriod) {
          const catId = tx.category_id || 'sem-categoria';
          recCatMap.set(catId, (recCatMap.get(catId) || 0) + val);
        }
        if (tx.type === 'receita' && provInPeriod) {
          const catId = tx.category_id || 'sem-categoria';
          recCatProvMap.set(catId, (recCatProvMap.get(catId) || 0) + val);
        }
      });

      if (filters?.includeProvisioned) {
        catProvMap.forEach((v, k) => catMap.set(k, (catMap.get(k) || 0) + v));
        recCatProvMap.forEach((v, k) => recCatMap.set(k, (recCatMap.get(k) || 0) + v));
      }

      // Build monthly array: iterate months from rangeStart→rangeEnd (cap 24)
      const shortMonth = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthlyData: { label: string; receitas: number; despesas: number; receitasProv: number; despesasProv: number }[] = [];
      const startD = new Date(rangeStart + 'T12:00:00');
      const endD = new Date(rangeEnd + 'T12:00:00');
      const monthsCount =
        (endD.getFullYear() - startD.getFullYear()) * 12 + (endD.getMonth() - startD.getMonth()) + 1;
      const cappedMonths = Math.min(Math.max(monthsCount, 1), 24);
      for (let i = 0; i < cappedMonths; i++) {
        const d = new Date(startD.getFullYear(), startD.getMonth() + i, 1);
        const key = toLocalISODate(d).substring(0, 7);
        const entry = monthMap.get(key) || { receitas: 0, despesas: 0, receitasProv: 0, despesasProv: 0 };
        monthlyData.push({
          label: `${shortMonth[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
          ...entry,
        });
      }

      // Category names
      let categoryData: { name: string; value: number }[] = [];
      let receitaCategoryData: { name: string; value: number }[] = [];
      const allCatIds = Array.from(
        new Set([...catMap.keys(), ...recCatMap.keys()].filter((id) => id !== 'sem-categoria'))
      );
      let nameMap = new Map<string, string>();
      if (allCatIds.length > 0) {
        const { data: cats, error: catErr } = await supabase.from('categories').select('id, name').in('id', allCatIds);
        if (catErr) throw new Error(catErr.message);
        nameMap = new Map((cats ?? []).map((c) => [c.id, c.name]));
      }
      if (catMap.size > 0) {
        categoryData = Array.from(catMap.entries()).map(([id, value]) => ({
          name: id === 'sem-categoria' ? 'Sem Categoria' : nameMap.get(id) || 'Outro',
          value,
        }));
      }
      if (recCatMap.size > 0) {
        receitaCategoryData = Array.from(recCatMap.entries()).map(([id, value]) => ({
          name: id === 'sem-categoria' ? 'Sem Categoria' : nameMap.get(id) || 'Outro',
          value,
        }));
      }

      // Saldo total (snapshot, independente do período)
      const allTxs = await fetchAllPages((from, to) =>
        supabase
          .from('transactions')
          .select('id, type, net_amount, status, unit_id, front_id, account_id, payment_date')
          .in('status', ['pago', 'recebido'] as Database['public']['Enums']['transaction_status'][])
          .eq('affects_cashflow', true)
          .order('id')
          .range(from, to)
      );

      // Rateio também no saldo: filtrar por unit_id/front_id direto na query
      // descartaria lançamentos rateados e deixaria o saldo incoerente com os KPIs.
      const saldoAllocMap = (unitFilter || frontFilter)
        ? buildAllocationMap(await fetchAllocations(allTxs.map((t) => t.id)))
        : new Map<string, AllocationRow[]>();

      // Saldo inicial: nunca inventar. Só soma o que estiver configurado.
      const { data: accountRows, error: accErr } = await supabase
        .from('accounts')
        .select('id, initial_balance, initial_balance_date')
        .eq('active', true);
      if (accErr) throw new Error(accErr.message);
      const openingMap = buildOpeningMap(accountRows);

      let movimentacaoCalculada = 0;
      allTxs.forEach((tx) => {
        // Movimento até a data-base já está embutido no saldo inicial informado.
        if (!isAfterOpening(tx, openingMap)) return;
        const val = valueForFilters(tx, saldoAllocMap, unitFilter, frontFilter);
        if (val === 0) return;
        movimentacaoCalculada += tx.type === 'receita' ? val : -val;
      });

      let saldoInicialTotal = 0;
      let saldoInicialConfigurado = false;
      if (!unitFilter && !frontFilter) {
        saldoInicialTotal = openingBalanceTotal(openingMap, today);
        saldoInicialConfigurado = hasOpeningBalance(openingMap, today);
      }
      const saldoTotal = movimentacaoCalculada + saldoInicialTotal;

      // Overdue / due-today (snapshot)
      const { data: alertBills, error: alertErr } = await supabase
        .from('transactions')
        .select('id, description, net_amount, due_date, type, unit_id, front_id, partner:partners(name)')
        .in('status', ['pendente', 'agendado'] as Database['public']['Enums']['transaction_status'][])
        .not('due_date', 'is', null)
        .lte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(1000);
      if (alertErr) throw new Error(alertErr.message);

      // Mesma regra de rateio dos KPIs: um lançamento rateado na unidade filtrada
      // precisa continuar aparecendo nos alertas de vencimento.
      const alertAllocMap = (unitFilter || frontFilter) && (alertBills ?? []).length > 0
        ? buildAllocationMap(await fetchAllocations((alertBills ?? []).map((b) => b.id)))
        : new Map<string, AllocationRow[]>();

      const overdueBills: OverdueBill[] = [];
      const dueTodayBills: OverdueBill[] = [];
      let vencendoHoje = 0;
      (alertBills ?? []).forEach((b) => {
        if ((unitFilter || frontFilter) && valueForFilters(b, alertAllocMap, unitFilter, frontFilter) === 0) return;
        const bill: OverdueBill = {
          id: b.id, description: b.description, net_amount: b.net_amount,
          due_date: b.due_date, type: b.type, partner_name: b.partner?.name,
        };
        if (b.due_date === today) { dueTodayBills.push(bill); vencendoHoje++; }
        else overdueBills.push(bill);
      });

      // Variation vs previous same-length period
      const incluirProv = !!filters?.includeProvisioned;
      const curReceitasForVar = receitasMes + (incluirProv ? receitasProvisionadas : 0);
      const curDespesasForVar = despesasMes + (incluirProv ? despesasProvisionadas : 0);
      const variacaoReceita = prevReceitas > 0
        ? ((curReceitasForVar - prevReceitas) / prevReceitas) * 100
        : null;
      const variacaoDespesa = prevDespesas > 0
        ? ((curDespesasForVar - prevDespesas) / prevDespesas) * 100
        : null;

      const margemContribuicao = curReceitasForVar - curDespesasForVar;

      // Unit ranking — período
      const unitDespMap = new Map<string, { despesas: number; receitas: number }>();
      rows.forEach((tx) => {
        const isPaid = tx.status === 'pago' || tx.status === 'recebido';
        const isProvisioned = tx.status === 'pendente' || tx.status === 'agendado';
        // Mesmas regras dos KPIs: pago conta se afeta o caixa; provisionado, se afeta o DRE.
        const paidInPeriod = isPaid && tx.affects_cashflow !== false && inRange(tx.payment_date, rangeStart, rangeEnd);
        const provInPeriod = isProvisioned && tx.affects_dre !== false && inRange(tx.competence_date, rangeStart, rangeEnd);
        const include = paidInPeriod || (incluirProv && provInPeriod);
        if (!include) return;
        // Com filtro de frente, só entram lançamentos que têm valor nessa frente.
        if (frontFilter && valueForFilters(tx, allocMap, unitFilter, frontFilter) === 0) return;
        // Rateio-aware: cada lançamento distribui entre unidades e "Sem unidade".
        splitByUnit(tx, allocMap).forEach(({ unitKey, value }) => {
          if (value === 0) return;
          if (unitFilter && unitKey !== unitFilter) return;
          const entry = unitDespMap.get(unitKey) || { despesas: 0, receitas: 0 };
          if (tx.type === 'despesa') entry.despesas += value;
          else entry.receitas += value;
          unitDespMap.set(unitKey, entry);
        });
      });

      let unitRanking: UnitRanking[] = [];
      if (unitDespMap.size > 0) {
        const unitIds = Array.from(unitDespMap.keys()).filter((k) => k !== NO_UNIT_KEY);
        const { data: unitRows, error: unitErr } = await supabase.from('units').select('id, name').in('id', unitIds);
        if (unitErr) throw new Error(unitErr.message);
        const uNameMap = new Map((unitRows ?? []).map((u) => [u.id, u.name]));
        unitRanking = Array.from(unitDespMap.entries())
          .map(([id, v]) => ({
            unitId: id,
            unitName: id === NO_UNIT_KEY ? 'Sem unidade' : (uNameMap.get(id) || 'Desconhecida'),
            despesas: v.despesas,
            receitas: v.receitas,
          }))
          .sort((a, b) => b.despesas - a.despesas);
      }

      if (isCancelled()) return;
      setData({
        saldoTotal, movimentacaoCalculada, saldoInicialConfigurado, saldoInicialTotal,
        receitasMes, despesasMes, receitasProvisionadas, despesasProvisionadas,
        contasAtrasadas: overdueBills.length, vencendoHoje,
        overdueBills, dueTodayBills, monthlyData, categoryData, receitaCategoryData, loading: false,
        semCategoria, semCategoriaReceita, semCategoriaDespesa,
        semUnidade, margemContribuicao, variacaoReceita, variacaoDespesa,
        unitRanking,
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
