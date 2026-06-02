import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  regime: 'competencia' | 'caixa';
  includeBudget?: boolean;
  includePrevious?: boolean;
  onlyRealized?: boolean;
}

function shiftDateBackOneYear(d: string) {
  const dt = new Date(d + 'T00:00:00');
  dt.setFullYear(dt.getFullYear() - 1);
  return dt.toISOString().split('T')[0];
}

// Compute totals per dre_line_id from a set of transactions, given allocations and filter
function computeLineValues(
  transactions: any[],
  allocMap: Map<string, any[]>,
  catToDre: Map<string, string>,
  unitFilter: string | undefined
) {
  const lineValues = new Map<string, number>();
  let unallocTotal = 0;
  let unallocCount = 0;

  transactions.forEach((tx: any) => {
    if (!tx.category_id) return;
    const dreLineId = catToDre.get(tx.category_id);
    if (!dreLineId) return;
    const totalVal = Number(tx.net_amount) || 0;
    const allocs = allocMap.get(tx.id);

    if (unitFilter === '__none__') {
      if (!tx.unit_id && (!allocs || allocs.length === 0)) {
        lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + totalVal);
      }
    } else if (unitFilter) {
      if (allocs && allocs.length > 0) {
        const u = allocs.find(a => a.unit_id === unitFilter);
        if (u) {
          let v = 0;
          if (u.allocation_type === 'percentual' && u.percentage) v = totalVal * (u.percentage / 100);
          else if (u.amount) v = Number(u.amount);
          lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + v);
        }
      } else if (tx.unit_id === unitFilter) {
        lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + totalVal);
      } else if (!tx.unit_id) {
        unallocTotal += totalVal;
        unallocCount++;
      }
    } else {
      lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + totalVal);
    }
  });

  return { lineValues, unallocTotal, unallocCount };
}

function buildSubtotals(allLines: any[], lineValues: Map<string, number>) {
  const computed = new Map<string, number>();
  const get = (line: any): number => {
    if (computed.has(line.id)) return computed.get(line.id)!;
    let val: number;
    if (!line.is_subtotal) {
      val = (lineValues.get(line.id) || 0) * (line.sign ?? 1);
    } else {
      const children = allLines.filter((c: any) => c.parent_id === line.id);
      if (children.length > 0) {
        val = children.reduce((s: number, c: any) => s + get(c), 0);
      } else {
        const code = line.code;
        if (code === '3') {
          const g1 = allLines.find((l: any) => l.code === '1');
          const g2 = allLines.find((l: any) => l.code === '2');
          val = (g1 ? get(g1) : 0) + (g2 ? get(g2) : 0);
        } else if (code === '5') {
          const g3 = allLines.find((l: any) => l.code === '3');
          const g4 = allLines.find((l: any) => l.code === '4');
          val = (g3 ? get(g3) : 0) + (g4 ? get(g4) : 0);
        } else if (code === '8') {
          const g5 = allLines.find((l: any) => l.code === '5');
          const g6 = allLines.find((l: any) => l.code === '6');
          const g7 = allLines.find((l: any) => l.code === '7');
          val = (g5 ? get(g5) : 0) + (g6 ? get(g6) : 0) + (g7 ? get(g7) : 0);
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
  const dateField = filters.regime === 'caixa' ? 'payment_date' : 'competence_date';
  let txQuery = supabase
    .from('transactions')
    .select('id, net_amount, category_id, status, unit_id')
    .gte(dateField, dateFrom)
    .lte(dateField, dateTo)
    .not('status', 'eq', 'cancelado')
    .limit(10000);
  if (filters.regime === 'caixa') {
    txQuery = txQuery.in('status', ['pago', 'recebido'] as any);
  } else if (filters.onlyRealized) {
    txQuery = txQuery.in('status', ['pago', 'recebido'] as any);
  }
  const { data: transactions, error } = await txQuery;
  if (error) throw error;
  if (transactions && transactions.length >= 10000) {
    console.warn('[useDreReport] Possível truncamento: 10.000 transações retornadas em', { dateFrom, dateTo, filters });
  }

  const txIds = (transactions ?? []).map((t: any) => t.id);
  const allocMap = new Map<string, any[]>();
  if (txIds.length > 0) {
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

  return computeLineValues(transactions ?? [], allocMap, catToDre, filters.unit_id);
}

async function fetchBudgetValues(
  dateFrom: string,
  dateTo: string,
  unitId: string | undefined,
  allLines: any[]
): Promise<Map<string, number>> {
  // Sum budget rows for months within [dateFrom..dateTo]
  const start = new Date(dateFrom + 'T00:00:00');
  const end = new Date(dateTo + 'T00:00:00');
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
  (data ?? []).forEach((b: any) => {
    if (!wanted.has(`${b.year}-${b.month}`)) return;
    sums.set(b.dre_line_id, (sums.get(b.dre_line_id) || 0) + Number(b.planned_amount));
  });
  return sums;
}

export function useDreReport() {
  const [lines, setLines] = useState<DreLineResult[]>([]);
  const [unallocatedTotal, setUnallocatedTotal] = useState(0);
  const [unallocatedCount, setUnallocatedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generate = useCallback(async (filters: DreFilters) => {
    setLoading(true);
    try {
      const { data: dreLines, error: dreErr } = await supabase
        .from('dre_lines')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      if (dreErr) throw dreErr;

      const { data: categories, error: catErr } = await supabase
        .from('categories')
        .select('id, dre_line_id')
        .eq('active', true)
        .not('dre_line_id', 'is', null);
      if (catErr) throw catErr;

      const catToDre = new Map<string, string>();
      (categories ?? []).forEach((c: any) => {
        if (c.dre_line_id) catToDre.set(c.id, c.dre_line_id);
      });

      const allLines = dreLines ?? [];

      // Depth
      const depthMap = new Map<string, number>();
      const getDepth = (id: string): number => {
        if (depthMap.has(id)) return depthMap.get(id)!;
        const line = allLines.find((l: any) => l.id === id);
        if (!line || !line.parent_id) { depthMap.set(id, 0); return 0; }
        const d = getDepth(line.parent_id) + 1;
        depthMap.set(id, d);
        return d;
      };
      allLines.forEach((l: any) => getDepth(l.id));

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

      const result: DreLineResult[] = allLines.map((l: any) => ({
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
    } catch (err: any) {
      toast({ title: 'Erro ao gerar DRE', description: err.message, variant: 'destructive' });
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { lines, loading, generate, unallocatedTotal, unallocatedCount };
}
