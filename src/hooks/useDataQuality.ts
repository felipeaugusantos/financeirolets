import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  transactionFingerprint,
  buildAllocationMap,
  allocationValue,
  txValue,
  CENT_TOLERANCE,
} from '@/lib/finance';
import { looksLikeTest, looksLikeTransfer } from '@/lib/reviewSuggestions';

export interface QualityTx {
  id: string;
  description: string;
  type: string;
  status: string;
  net_amount: number;
  amount: number;
  competence_date: string;
  due_date: string | null;
  payment_date: string | null;
  category_id: string | null;
  unit_id: string | null;
  front_id: string | null;
  partner_id: string | null;
  account_id: string | null;
  affects_dre: boolean;
  affects_cashflow: boolean;
}

export interface DuplicateGroup {
  key: string;
  items: QualityTx[];
}

export interface CategoryIssue {
  id: string;
  name: string;
  type: string;
  problem: 'sem-dre' | 'sem-uso';
  usageCount: number;
}

export interface DreLineIssue {
  dreLineName: string;
  categories: string[];
}

export interface LookupItem { id: string; name: string }

export interface AllocationIssue {
  tx: QualityTx;
  /** Quanto do lançamento ficou sem destino (sobra que cai em "Sem unidade"). */
  residual: number;
  /** Quanto foi efetivamente distribuído pelas linhas de rateio. */
  allocated: number;
}

export interface OrphanCategoryGroup {
  categoryId: string;
  categoryName: string;
  items: QualityTx[];
}

export interface DataQualityResult {
  loading: boolean;
  duplicates: DuplicateGroup[];
  typeStatusMismatch: QualityTx[];
  semCategoria: QualityTx[];
  semUnidade: QualityTx[];
  foraDoDre: QualityTx[];
  foraDoCaixa: QualityTx[];
  pagoSemData: QualityTx[];
  semFornecedor: QualityTx[];
  categoryIssues: CategoryIssue[];
  dreLineIssues: DreLineIssue[];
  /** Lançamentos com cara de teste/demo. Nunca excluídos automaticamente. */
  testSuspects: QualityTx[];
  /** Transferências entre contas que hoje entram no DRE. */
  transfersInDre: QualityTx[];
  /** Lançamentos em categorias sem linha de DRE, agrupados por categoria. */
  orphanCategoryGroups: OrphanCategoryGroup[];
  /** Rateios que não fecham com o valor do lançamento (sobra vai para "Sem unidade"). */
  allocationIssues: AllocationIssue[];
  fronts: LookupItem[];
  categories: (LookupItem & { type: string; dre_line_id: string | null; active: boolean })[];
  units: LookupItem[];
  accounts: LookupItem[];
  dreLines: LookupItem[];
  categoryNameById: Map<string, string>;
  unitNameById: Map<string, string>;
  accountNameById: Map<string, string>;
  total: number;
}

const empty: DataQualityResult = {
  loading: true,
  duplicates: [],
  typeStatusMismatch: [],
  semCategoria: [],
  semUnidade: [],
  foraDoDre: [],
  foraDoCaixa: [],
  pagoSemData: [],
  semFornecedor: [],
  categoryIssues: [],
  dreLineIssues: [],
  testSuspects: [],
  transfersInDre: [],
  orphanCategoryGroups: [],
  allocationIssues: [],
  fronts: [],
  categories: [],
  units: [],
  accounts: [],
  dreLines: [],
  categoryNameById: new Map(),
  unitNameById: new Map(),
  accountNameById: new Map(),
  total: 0,
};

/**
 * Levantamento SOMENTE LEITURA de lançamentos que precisam de revisão manual.
 * Nada aqui altera, corrige ou apaga registros.
 */
export function useDataQuality(range?: { from?: string; to?: string }) {
  const [result, setResult] = useState<DataQualityResult>(empty);

  const load = useCallback(async () => {
    setResult((r) => ({ ...r, loading: true }));
    try {
      let q = supabase
        .from('transactions')
        .select(
          'id, description, type, status, amount, net_amount, competence_date, due_date, payment_date, category_id, unit_id, front_id, partner_id, account_id, affects_dre, affects_cashflow'
        )
        .order('competence_date', { ascending: false })
        .limit(10000);
      if (range?.from) q = q.gte('competence_date', range.from);
      if (range?.to) q = q.lte('competence_date', range.to);

      const [
        { data: txs, error },
        { data: allocs },
        { data: cats },
        { data: dreLines },
        { data: unitRows },
        { data: accountRows },
        { data: frontRows },
      ] = await Promise.all([
        q,
        supabase
          .from('transaction_allocations')
          .select('transaction_id, unit_id, front_id, allocation_type, percentage, amount'),
        supabase.from('categories').select('id, name, type, dre_line_id, active'),
        supabase.from('dre_lines').select('id, name').eq('active', true),
        supabase.from('units').select('id, name').order('name'),
        supabase.from('accounts').select('id, name').order('name'),
        supabase.from('business_fronts').select('id, name').eq('active', true).order('name'),
      ]);
      if (error) throw error;

      const rows = (txs ?? []) as unknown as QualityTx[];
      const allocUnits = new Set(
        (allocs ?? []).filter((a: any) => a.unit_id).map((a: any) => a.transaction_id)
      );

      // Possíveis duplicados (mesma natureza + data + valor + descrição)
      const fpMap = new Map<string, QualityTx[]>();
      rows.forEach((t) => {
        if (t.status === 'cancelado') return;
        const fp = transactionFingerprint(t);
        const list = fpMap.get(fp) || [];
        list.push(t);
        fpMap.set(fp, list);
      });
      const duplicates: DuplicateGroup[] = Array.from(fpMap.entries())
        .filter(([, items]) => items.length > 1)
        .map(([key, items]) => ({ key, items }))
        .sort((a, b) => b.items.length - a.items.length);

      const active = rows.filter((t) => t.status !== 'cancelado');

      const typeStatusMismatch = active.filter(
        (t) => (t.type === 'despesa' && t.status === 'recebido') || (t.type === 'receita' && t.status === 'pago')
      );
      const semCategoria = active.filter((t) => !t.category_id);
      const semUnidade = active.filter((t) => !t.unit_id && !allocUnits.has(t.id));
      const foraDoDre = active.filter((t) => t.affects_dre === false);
      const foraDoCaixa = active.filter((t) => t.affects_cashflow === false);
      const pagoSemData = active.filter(
        (t) => (t.status === 'pago' || t.status === 'recebido') && !t.payment_date
      );
      const semFornecedor = active.filter((t) => t.type === 'despesa' && !t.partner_id);

      // Blocos novos de revisão manual
      const testSuspects = active.filter((t) => looksLikeTest(t));
      const transfersInDre = active.filter((t) => looksLikeTransfer(t) && t.affects_dre !== false);

      const orphanCatIds = new Map<string, string>();
      (cats ?? []).forEach((c: any) => {
        if (!c.dre_line_id) orphanCatIds.set(c.id, c.name);
      });
      const orphanMap = new Map<string, QualityTx[]>();
      active.forEach((t) => {
        if (t.category_id && orphanCatIds.has(t.category_id)) {
          const list = orphanMap.get(t.category_id) || [];
          list.push(t);
          orphanMap.set(t.category_id, list);
        }
      });
      const orphanCategoryGroups: OrphanCategoryGroup[] = Array.from(orphanMap.entries())
        .map(([categoryId, items]) => ({
          categoryId,
          categoryName: orphanCatIds.get(categoryId) || 'Categoria',
          items,
        }))
        .sort((a, b) => b.items.length - a.items.length);

      // Rateios que não fecham com o valor do lançamento
      const allocMap = buildAllocationMap((allocs ?? []) as any);
      const allocationIssues: AllocationIssue[] = [];
      active.forEach((t) => {
        const lines = allocMap.get(t.id);
        if (!lines || lines.length === 0) return;
        const total = txValue(t);
        const allocated = lines.reduce((s, a) => s + allocationValue(a, total), 0);
        const residual = total - allocated;
        if (Math.abs(residual) > CENT_TOLERANCE) {
          allocationIssues.push({ tx: t, residual, allocated });
        }
      });
      allocationIssues.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));

      // Categorias
      const usage = new Map<string, number>();
      rows.forEach((t) => {
        if (t.category_id) usage.set(t.category_id, (usage.get(t.category_id) || 0) + 1);
      });
      const categoryIssues: CategoryIssue[] = [];
      const dreLineMap = new Map((dreLines ?? []).map((l: any) => [l.id, l.name as string]));
      const perDreLine = new Map<string, string[]>();
      (cats ?? []).forEach((c: any) => {
        const used = usage.get(c.id) || 0;
        if (!c.dre_line_id) {
          categoryIssues.push({ id: c.id, name: c.name, type: c.type, problem: 'sem-dre', usageCount: used });
        } else {
          const list = perDreLine.get(c.dre_line_id) || [];
          list.push(c.name);
          perDreLine.set(c.dre_line_id, list);
        }
        // Categorias desativadas sem uso não são problema: foram aposentadas de propósito.
        if (used === 0 && c.active !== false) {
          categoryIssues.push({ id: c.id, name: c.name, type: c.type, problem: 'sem-uso', usageCount: 0 });
        }
      });
      const dreLineIssues: DreLineIssue[] = Array.from(perDreLine.entries())
        .filter(([, names]) => names.length > 1)
        .map(([id, names]) => ({ dreLineName: dreLineMap.get(id) || 'Linha desconhecida', categories: names }))
        .sort((a, b) => b.categories.length - a.categories.length);

      setResult({
        loading: false,
        duplicates,
        typeStatusMismatch,
        semCategoria,
        semUnidade,
        foraDoDre,
        foraDoCaixa,
        pagoSemData,
        semFornecedor,
        categoryIssues,
        dreLineIssues,
        testSuspects,
        transfersInDre,
        orphanCategoryGroups,
        allocationIssues,
        fronts: (frontRows ?? []) as any,
        categories: (cats ?? []) as any,
        units: (unitRows ?? []) as any,
        accounts: (accountRows ?? []) as any,
        dreLines: (dreLines ?? []) as any,
        categoryNameById: new Map((cats ?? []).map((c: any) => [c.id, c.name as string])),
        unitNameById: new Map((unitRows ?? []).map((u: any) => [u.id, u.name as string])),
        accountNameById: new Map((accountRows ?? []).map((a: any) => [a.id, a.name as string])),
        total:
          duplicates.reduce((s, g) => s + g.items.length, 0) +
          typeStatusMismatch.length +
          semCategoria.length +
          semUnidade.length +
          allocationIssues.length +
          pagoSemData.length,
      });
    } catch {
      setResult({ ...empty, loading: false });
    }
  }, [range?.from, range?.to]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...result, reload: load };
}
