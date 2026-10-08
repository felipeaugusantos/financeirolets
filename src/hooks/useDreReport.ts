import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toLocalISODate, errorMessage } from '@/lib/utils';
import type { Database, Tables } from '@/integrations/supabase/types';
import {
  applyDreBase,
  applyCategoryFilter,
  buildAllocationMap,
  dateFieldForRegime,
  splitByUnit,
  txValue,
  NO_UNIT_KEY,
  type AllocationRow,
} from '@/lib/finance';

type DreLineRow = Tables<'dre_lines'>;

/** Campos de transactions usados para somar o DRE. */
interface DreTxRow {
  id: string;
  net_amount: number | string | null;
  category_id: string | null;
  unit_id: string | null;
  type: string;
  description?: string | null;
  competence_date?: string | null;
  payment_date?: string | null;
}

export interface OutOfDreItem {
  id: string;
  description: string;
  date: string | null;
  category_id: string | null;
  value: number;
}

export interface DreLineResult {
  id: string;
  code: string | null;
  name: string;
  sort_order: number;
  is_subtotal: boolean;
  sign: number;
  parent_id: string | null;
  value: number;
  budgetValue?: number;
  previousValue?: number;
  depth: number;
}

export interface DreFilters {
  dateFrom: string;
  dateTo: string;
  unit_id?: string;
  category_id?: string;
  regime: 'competencia' | 'caixa';
  includeBudget?: boolean;
  includePrevious?: boolean;
  onlyRealized?: boolean;
  payment_method?: string;
}

function shiftDateBackOneYear(d: string) {
  // Coluna `date` (YYYY-MM-DD): manipulação puramente textual/local, sem UTC.
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y - 1, m - 1, day);
  return toLocalISODate(dt);
}

// Compute totals per dre_line_id from a set of transactions, given allocations and filter
function computeLineValues(
  transactions: DreTxRow[],
  allocMap: Map<string, AllocationRow[]>,
  catToDre: Map<string, string>,
  unitFilter: string | undefined
) {
  const lineValues = new Map<string, number>();
  let unallocTotal = 0;
  let unallocCount = 0;
  // Lançamentos que não pertencem a nenhuma linha do DRE (sem categoria ou
  // categoria sem dre_line_id). Antes eram descartados em silêncio.
  let outOfDreTotal = 0;
  let outOfDreCount = 0;
  const outOfDreItems: OutOfDreItem[] = [];
  const lineItems = new Map<string, OutOfDreItem[]>();
  const pushItem = (lineId: string, tx: DreTxRow, v: number) => {
    const list = lineItems.get(lineId) || [];
    list.push({
      id: tx.id, description: tx.description || '—',
      date: tx.competence_date ?? tx.payment_date ?? null,
      category_id: tx.category_id, value: v,
    });
    lineItems.set(lineId, list);
  };

  transactions.forEach((tx) => {
    const totalVal = txValue(tx);
    const dreLineId = tx.category_id ? catToDre.get(tx.category_id) : undefined;
    if (!dreLineId) {
      const share = unitFilter
        ? splitByUnit(tx, allocMap)
            .filter((s) => s.unitKey === unitFilter)
            .reduce((sum, s) => sum + s.value, 0)
        : totalVal;
      if (share !== 0) {
        outOfDreTotal += tx.type === 'despesa' ? -share : share;
        outOfDreCount++;
        outOfDreItems.push({
          id: tx.id,
          description: tx.description || '—',
          date: tx.competence_date ?? tx.payment_date ?? null,
          category_id: tx.category_id,
          value: tx.type === 'despesa' ? -share : share,
        });
      }
      return;
    }
    // Regra única de rateio/unidade compartilhada com Dashboard, DRE Comparativo e Fluxo de Caixa.
    const splits = splitByUnit(tx, allocMap);
    const add = (v: number) => {
      lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + v);
      pushItem(dreLineId, tx, v);
    };

    if (!unitFilter) {
      add(totalVal);
      return;
    }

    const matched = splits
      .filter((s) => s.unitKey === unitFilter)
      .reduce((sum, s) => sum + s.value, 0);
    if (matched !== 0) add(matched);

    // Lançamentos sem unidade e sem rateio ficam visíveis como "sem unidade"
    // quando um filtro de unidade real está aplicado (nunca somem silenciosamente).
    if (unitFilter !== NO_UNIT_KEY && splits.every((s) => s.unitKey === NO_UNIT_KEY)) {
      unallocTotal += totalVal;
      unallocCount++;
    }
  });

  return { lineValues, unallocTotal, unallocCount, outOfDreTotal, outOfDreCount, outOfDreItems, lineItems };
}

function buildSubtotals(allLines: DreLineRow[], lineValues: Map<string, number>) {
  const computed = new Map<string, number>();
  const get = (line: DreLineRow): number => {
    if (computed.has(line.id)) return computed.get(line.id)!;
    let val: number;
    if (!line.is_subtotal) {
      val = (lineValues.get(line.id) || 0) * (line.sign ?? 1);
    } else {
      const children = allLines.filter((c) => c.parent_id === line.id);
      if (children.length > 0) {
        val = children.reduce((s: number, c) => s + get(c), 0);
      } else {
        const code = line.code;
        if (code === '3') {
          const g1 = allLines.find((l) => l.code === '1');
          const g2 = allLines.find((l) => l.code === '2');
          val = (g1 ? get(g1) : 0) + (g2 ? get(g2) : 0);
        } else if (code === '5') {
          const g3 = allLines.find((l) => l.code === '3');
          const g4 = allLines.find((l) => l.code === '4');
          val = (g3 ? get(g3) : 0) + (g4 ? get(g4) : 0);
        } else if (code === '8') {
          const g5 = allLines.find((l) => l.code === '5');
          // Pró-labore/honorários da diretoria ficam fora do resultado operacional,
          // mas continuam impactando o caixa retido.
          const g51 = allLines.find((l) => l.code === '5.1');
          const g6 = allLines.find((l) => l.code === '6');
          const g7 = allLines.find((l) => l.code === '7');
          val = (g5 ? get(g5) : 0) + (g51 ? get(g51) : 0) + (g6 ? get(g6) : 0) + (g7 ? get(g7) : 0);
        } else {
          val = 0;
        }
      }
    }
    computed.set(line.id, val);
    return val;
  };
  allLines.forEach(l => get(l));
  return computed;
}

async function fetchPeriodValues(
  dateFrom: string,
  dateTo: string,
  filters: DreFilters,
  catToDre: Map<string, string>
) {
  const dateField = dateFieldForRegime(filters.regime);
  let txQuery = supabase
    .from('transactions')
    .select('id, net_amount, category_id, status, unit_id, type, description, competence_date, payment_date, is_reversal')
    .gte(dateField, dateFrom)
    .lte(dateField, dateTo)
    .limit(10000);
  txQuery = applyDreBase(txQuery, { regime: filters.regime, onlyRealized: filters.onlyRealized });
  txQuery = applyCategoryFilter(txQuery, filters.category_id);
  if (filters.payment_method) {
    txQuery = (filters.payment_method === '__none__' || filters.payment_method === '__null__')
      ? txQuery.is('payment_method', null)
      : txQuery.eq('payment_method', filters.payment_method as Database['public']['Enums']['payment_method']);
  }
  const { data: transactions, error } = await txQuery;
  if (error) throw error;
  if (transactions && transactions.length >= 10000) {
    console.warn('[useDreReport] Possível truncamento: 10.000 transações retornadas em', { dateFrom, dateTo, filters });
  }

  const txIds = (transactions ?? []).map((t) => t.id);
  let allocMap = new Map<string, AllocationRow[]>();
  if (txIds.length > 0) {
    const { data: allocs } = await supabase
      .from('transaction_allocations')
      .select('transaction_id, unit_id, allocation_type, percentage, amount')
      .in('transaction_id', txIds);
    allocMap = buildAllocationMap(allocs);
  }

  return computeLineValues(transactions ?? [], allocMap, catToDre, filters.unit_id);
}

async function fetchBudgetValues(
  dateFrom: string,
  dateTo: string,
  unitId: string | undefined,
  allLines: DreLineRow[]
): Promise<Map<string, number>> {
  // Sum budget rows for months within [dateFrom..dateTo]
  const start = new Date(dateFrom + 'T12:00:00');
  const end = new Date(dateTo + 'T12:00:00');
  const months: { year: number; month: number }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  if (months.length === 0) return new Map();

  const minYear = Math.min(...months.map(m => m.year));
  const maxYear = Math.max(...months.map(m => m.year));

  let q = supabase
    .from('budgets')
    .select('year, month, dre_line_id, planned_amount')
    .gte('year', minYear)
    .lte('year', maxYear);
  if (unitId && unitId !== '__none__') q = q.eq('unit_id', unitId);
  else q = q.is('unit_id', null);

  const { data, error } = await q;
  if (error) throw error;

  const wanted = new Set(months.map(m => `${m.year}-${m.month}`));
  const sums = new Map<string, number>();
  (data ?? []).forEach((b) => {
    if (!wanted.has(`${b.year}-${b.month}`)) return;
    sums.set(b.dre_line_id, (sums.get(b.dre_line_id) || 0) + Number(b.planned_amount));
  });
  return sums;
}

export function useDreReport() {
  const [lines, setLines] = useState<DreLineResult[]>([]);
  const [unallocatedTotal, setUnallocatedTotal] = useState(0);
  const [unallocatedCount, setUnallocatedCount] = useState(0);
  const [outOfDreTotal, setOutOfDreTotal] = useState(0);
  const [outOfDreCount, setOutOfDreCount] = useState(0);
  const [outOfDreItems, setOutOfDreItems] = useState<OutOfDreItem[]>([]);
  const [lineItems, setLineItems] = useState<Map<string, OutOfDreItem[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generate = useCallback(async (filters: DreFilters) => {
    setLoading(true);
    try {
      const { data: dreLines, error: dreErr } = await supabase
        .from('dre_lines')
        .select('*')
        .eq('active', true)
        .neq('view_scope', 'contabil')
        .order('sort_order');
      if (dreErr) throw dreErr;

      const { data: categories, error: catErr } = await supabase
        .from('categories')
        // NÃO filtrar por `active`: `active` controla apenas o que aparece para
        // NOVOS lançamentos. Uma categoria desativada que já tem histórico precisa
        // continuar somando normalmente no DRE.
        .select('id, dre_line_id')
        .not('dre_line_id', 'is', null);
      if (catErr) throw catErr;

      const catToDre = new Map<string, string>();
      (categories ?? []).forEach((c) => {
        if (c.dre_line_id) catToDre.set(c.id, c.dre_line_id);
      });

      const allLines = dreLines ?? [];

      // Depth
      const depthMap = new Map<string, number>();
      const getDepth = (id: string): number => {
        if (depthMap.has(id)) return depthMap.get(id)!;
        const line = allLines.find((l) => l.id === id);
        if (!line || !line.parent_id) { depthMap.set(id, 0); return 0; }
        const d = getDepth(line.parent_id) + 1;
        depthMap.set(id, d);
        return d;
      };
      allLines.forEach((l) => getDepth(l.id));

      // Current period
      const current = await fetchPeriodValues(filters.dateFrom, filters.dateTo, filters, catToDre);
      const currentTotals = buildSubtotals(allLines, current.lineValues);

      // Previous period (year-over-year)
      let previousTotals: Map<string, number> | null = null;
      if (filters.includePrevious) {
        const prevFrom = shiftDateBackOneYear(filters.dateFrom);
        const prevTo = shiftDateBackOneYear(filters.dateTo);
        const prev = await fetchPeriodValues(prevFrom, prevTo, filters, catToDre);
        previousTotals = buildSubtotals(allLines, prev.lineValues);
      }

      // Budget
      let budgetTotals: Map<string, number> | null = null;
      if (filters.includeBudget) {
        const raw = await fetchBudgetValues(filters.dateFrom, filters.dateTo, filters.unit_id, allLines);
        // Apply sign and roll-up subtotals
        budgetTotals = buildSubtotals(allLines, raw);
      }

      const result: DreLineResult[] = allLines.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        sort_order: l.sort_order,
        is_subtotal: l.is_subtotal,
        sign: l.sign,
        parent_id: l.parent_id,
        value: currentTotals.get(l.id) ?? 0,
        budgetValue: budgetTotals?.get(l.id),
        previousValue: previousTotals?.get(l.id),
        depth: depthMap.get(l.id) || 0,
      }));

      setLines(result);
      setUnallocatedTotal(current.unallocTotal);
      setUnallocatedCount(current.unallocCount);
      setOutOfDreTotal(current.outOfDreTotal);
      setOutOfDreCount(current.outOfDreCount);
      setOutOfDreItems(current.outOfDreItems);
      setLineItems(current.lineItems);
    } catch (err: unknown) {
      toast({ title: 'Erro ao gerar DRE', description: errorMessage(err), variant: 'destructive' });
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { lines, loading, generate, unallocatedTotal, unallocatedCount, outOfDreTotal, outOfDreCount, outOfDreItems, lineItems };
}
