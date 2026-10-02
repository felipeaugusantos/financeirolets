import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toLocalISODate, errorMessage } from '@/lib/utils';
import {
  applyDreBase,
  buildAllocationMap,
  dateFieldForRegime,
  valueForFilters,
  txValue,
  type AllocationRow,
} from '@/lib/finance';

/**
 * DRE Gerencial (visão contábil).
 *
 * Usa a MESMA base de dados e as MESMAS regras de rateio do DRE atual
 * (`src/lib/finance.ts`), mas lê a estrutura de linhas com
 * `view_scope = 'contabil'` e o vínculo `categories.dre_line_contabil_id`.
 * Nada aqui altera o DRE gerencial existente.
 */

export interface DreGerencialLine {
  id: string;
  code: string | null;
  name: string;
  sort_order: number;
  is_subtotal: boolean;
  sign: number;
  parent_id: string | null;
  line_type: string | null;
  formula: string | null;
  depth: number;
  value: number;
  previousValue?: number;
}

export interface MissingCategory {
  categoryId: string | null;
  name: string;
  type: string | null;
  count: number;
  total: number;
  /** Linha do DRE Gerencial (view padrão) à qual a categoria está vinculada. */
  gerencialCode: string | null;
  gerencialName: string | null;
  /** true quando a linha gerencial é patrimonial/financeira (grupos 6 e 7). */
  isPatrimonial: boolean;
}

export type ComparisonMode = 'none' | 'previous' | 'lastYear';

export interface DreGerencialFilters {
  dateFrom: string;
  dateTo: string;
  unit_id?: string;
  front_id?: string;
  regime: 'competencia' | 'caixa';
  onlyRealized?: boolean;
  comparison: ComparisonMode;
}

function shiftYear(d: string, delta: number) {
  const [y, m, day] = d.split('-').map(Number);
  return toLocalISODate(new Date(y + delta, m - 1, day));
}

/** Período imediatamente anterior, com a mesma quantidade de dias. */
function previousWindow(from: string, to: string) {
  const f = new Date(from + 'T12:00:00');
  const t = new Date(to + 'T12:00:00');
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const prevTo = new Date(f.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
  return { from: toLocalISODate(prevFrom), to: toLocalISODate(prevTo) };
}

/**
 * Resolve o valor de cada linha respeitando:
 *  - `formula` (ex.: "C1+C2") quando existir;
 *  - soma dos filhos, para subtotais;
 *  - valor lançado × sinal, para linhas analíticas.
 */
function resolveValues(allLines: any[], lineValues: Map<string, number>) {
  const byCode = new Map<string, any>();
  allLines.forEach((l) => { if (l.code) byCode.set(l.code, l); });
  const computed = new Map<string, number>();
  const visiting = new Set<string>();

  const get = (line: any): number => {
    if (computed.has(line.id)) return computed.get(line.id)!;
    if (visiting.has(line.id)) return 0; // proteção contra fórmula circular
    visiting.add(line.id);

    let val = 0;
    if (line.formula) {
      // Tokens no formato "C1+C2-C3"
      const terms: string[] = String(line.formula).match(/[+-]?[^+-]+/g) ?? [];
      val = terms.reduce<number>((sum, raw) => {
        const t = raw.trim();
        const negative = t.startsWith('-');
        const code = t.replace(/^[+-]/, '').trim();
        const ref = byCode.get(code);
        if (!ref) return sum;
        return sum + (negative ? -get(ref) : get(ref));
      }, 0);
    } else if (line.is_subtotal) {
      const children = allLines.filter((c) => c.parent_id === line.id);
      val = children.reduce((s: number, c) => s + get(c), 0);
    } else {
      val = (lineValues.get(line.id) || 0) * (line.sign ?? 1);
    }

    visiting.delete(line.id);
    computed.set(line.id, val);
    return val;
  };

  allLines.forEach((l) => get(l));
  return computed;
}

async function fetchLineValues(
  dateFrom: string,
  dateTo: string,
  filters: DreGerencialFilters,
  catToDre: Map<string, string>,
  /** Linha usada quando a categoria (ou a falta dela) não tem vínculo contábil. */
  fallbackByType: { receita?: string; despesa?: string } = {}
) {

  const dateField = dateFieldForRegime(filters.regime);
  let q = supabase
    .from('transactions')
    .select('id, net_amount, category_id, status, unit_id, front_id, type')
    .gte(dateField, dateFrom)
    .lte(dateField, dateTo)
    .limit(10000);
  q = applyDreBase(q, { regime: filters.regime, onlyRealized: filters.onlyRealized });
  // O filtro de frente NÃO pode ir na query: um lançamento sem front_id pode ter
  // rateio com frente (e vice-versa). A regra correta é valueForFilters.

  const { data: transactions, error } = await q;
  if (error) throw error;

  const txIds = (transactions ?? []).map((t) => t.id);
  let allocMap = new Map<string, AllocationRow[]>();
  if (txIds.length > 0) {
    const { data: allocs } = await supabase
      .from('transaction_allocations')
      .select('transaction_id, unit_id, front_id, allocation_type, percentage, amount')
      .in('transaction_id', txIds);
    allocMap = buildAllocationMap(allocs);
  }

  const lineValues = new Map<string, number>();
  let outOfDreTotal = 0;
  let outOfDreCount = 0;
  const missing = new Map<string, { categoryId: string | null; count: number; total: number }>();

  (transactions ?? []).forEach((tx) => {
    const total = txValue(tx);
    const share =
      filters.unit_id || filters.front_id
        ? valueForFilters(tx, allocMap, filters.unit_id, filters.front_id)
        : total;
    if (share === 0) return;

    const lineId = tx.category_id ? catToDre.get(tx.category_id) : undefined;
    const resolved = lineId
      ?? (tx.type === 'despesa' ? fallbackByType.despesa : fallbackByType.receita);
    if (!resolved) {
      const signed = tx.type === 'despesa' ? -share : share;
      outOfDreTotal += signed;
      outOfDreCount++;
      const key = tx.category_id ?? '__none__';
      const cur = missing.get(key) ?? { categoryId: tx.category_id ?? null, count: 0, total: 0 };
      cur.count++;
      cur.total += signed;
      missing.set(key, cur);
      return;
    }
    lineValues.set(resolved, (lineValues.get(resolved) || 0) + share);
  });


  return { lineValues, outOfDreTotal, outOfDreCount, missing };
}


export function useDreGerencial() {
  const [lines, setLines] = useState<DreGerencialLine[]>([]);
  const [outOfDreTotal, setOutOfDreTotal] = useState(0);
  const [outOfDreCount, setOutOfDreCount] = useState(0);
  const [missingCategories, setMissingCategories] = useState<MissingCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const generate = useCallback(async (filters: DreGerencialFilters) => {
    setLoading(true);
    setError(null);
    try {
      const { data: dreLines, error: dreErr } = await supabase
        .from('dre_lines')
        .select('*')
        .eq('active', true)
        .eq('view_scope', 'contabil')
        .order('sort_order');
      if (dreErr) throw dreErr;

      const { data: categories, error: catErr } = await supabase
        .from('categories')
        .select('id, name, type, dre_line_contabil_id, dre_line_id');
      if (catErr) throw catErr;

      const { data: allDreLines } = await supabase
        .from('dre_lines')
        .select('id, code, name');
      const lineById = new Map<string, { code: string | null; name: string }>();
      (allDreLines ?? []).forEach((l) => lineById.set(l.id, { code: l.code, name: l.name }));

      const allLinesRaw = (dreLines ?? []) as any[];
      /** Linha contábil por código (C1.02, C6.05, ...) para o vínculo automático. */
      const contabilByCode = new Map<string, string>();
      allLinesRaw.forEach((l) => { if (l.code) contabilByCode.set(l.code, l.id); });

      /**
       * Toda categoria precisa aparecer no DRE Contábil. Quando não há vínculo
       * manual, deduzimos a linha pela estrutura gerencial da categoria.
       */
      const autoContabil = (gerCode: string | null, type: string): string | undefined => {
        const code = (() => {
          if (gerCode?.startsWith('6.1.') || gerCode === '6.2.10') return 'C1.02';
          if (gerCode === '6.2.07') return 'C8.01';
          if (gerCode === '7.2.07') return 'C8.02';
          if (gerCode?.startsWith('6.')) return 'C12.01';
          if (gerCode?.startsWith('7.')) return 'C12.02';
          return type === 'receita' ? 'C1.02' : 'C6.05';
        })();
        return contabilByCode.get(code);
      };

      const catToDre = new Map<string, string>();
      const catNames = new Map<
        string,
        { name: string; type: string; gerencialCode: string | null; gerencialName: string | null }
      >();
      (categories ?? []).forEach((c) => {
        const ger = c.dre_line_id ? lineById.get(c.dre_line_id) : undefined;
        const target = c.dre_line_contabil_id ?? autoContabil(ger?.code ?? null, c.type);
        if (target) catToDre.set(c.id, target);
        catNames.set(c.id, {
          name: c.name,
          type: c.type,
          gerencialCode: ger?.code ?? null,
          gerencialName: ger?.name ?? null,
        });
      });

      /** Lançamentos sem categoria também entram, nas linhas genéricas. */
      const fallbackByType = {
        receita: contabilByCode.get('C1.02'),
        despesa: contabilByCode.get('C6.05'),
      };


      const allLines = allLinesRaw;

      const depthMap = new Map<string, number>();
      const getDepth = (id: string): number => {
        if (depthMap.has(id)) return depthMap.get(id)!;
        const l = allLines.find((x) => x.id === id);
        if (!l || !l.parent_id) { depthMap.set(id, 0); return 0; }
        const d = getDepth(l.parent_id) + 1;
        depthMap.set(id, d);
        return d;
      };
      allLines.forEach((l) => getDepth(l.id));

      const current = await fetchLineValues(filters.dateFrom, filters.dateTo, filters, catToDre, fallbackByType);
      const currentTotals = resolveValues(allLines, current.lineValues);

      let previousTotals: Map<string, number> | null = null;
      if (filters.comparison !== 'none') {
        const win = filters.comparison === 'lastYear'
          ? { from: shiftYear(filters.dateFrom, -1), to: shiftYear(filters.dateTo, -1) }
          : previousWindow(filters.dateFrom, filters.dateTo);
        const prev = await fetchLineValues(win.from, win.to, filters, catToDre, fallbackByType);
        previousTotals = resolveValues(allLines, prev.lineValues);
      }


      setLines(allLines.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        sort_order: l.sort_order,
        is_subtotal: l.is_subtotal,
        sign: l.sign,
        parent_id: l.parent_id,
        line_type: l.line_type ?? null,
        formula: l.formula ?? null,
        depth: depthMap.get(l.id) || 0,
        value: currentTotals.get(l.id) ?? 0,
        previousValue: previousTotals?.get(l.id),
      })));
      setOutOfDreTotal(current.outOfDreTotal);
      setOutOfDreCount(current.outOfDreCount);
      setMissingCategories(
        Array.from(current.missing.values())
          .map((m) => {
            const info = m.categoryId ? catNames.get(m.categoryId) : undefined;
            const gerencialCode = info?.gerencialCode ?? null;
            return {
              categoryId: m.categoryId,
              name: m.categoryId ? info?.name ?? 'Categoria removida' : 'Sem categoria',
              type: m.categoryId ? info?.type ?? null : null,
              count: m.count,
              total: m.total,
              gerencialCode,
              gerencialName: info?.gerencialName ?? null,
              isPatrimonial: !!gerencialCode && /^[67][.]/.test(gerencialCode),
            };
          })
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      );
    } catch (err: unknown) {
      setError(errorMessage(err) ?? 'Erro desconhecido');
      setLines([]);
      setMissingCategories([]);
      toast({ title: 'Erro ao gerar DRE Gerencial', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { lines, loading, error, generate, outOfDreTotal, outOfDreCount, missingCategories };
}
