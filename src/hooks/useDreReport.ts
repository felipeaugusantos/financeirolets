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
  depth: number;
}

export interface DreFilters {
  dateFrom: string;
  dateTo: string;
  unit_id?: string;
  regime: 'competencia' | 'caixa';
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
      // 1. Fetch DRE lines
      const { data: dreLines, error: dreErr } = await supabase
        .from('dre_lines')
        .select('*')
        .eq('active', true)
        .order('sort_order');

      if (dreErr) throw dreErr;

      // 2. Fetch categories with dre_line_id
      const { data: categories, error: catErr } = await supabase
        .from('categories')
        .select('id, dre_line_id, type')
        .eq('active', true)
        .not('dre_line_id', 'is', null);

      if (catErr) throw catErr;

      // 3. Fetch transactions for the period
      const dateField = filters.regime === 'caixa' ? 'payment_date' : 'competence_date';

      let txQuery = supabase
        .from('transactions')
        .select('id, amount, tax_amount, net_amount, category_id, type, status, unit_id')
        .gte(dateField, filters.dateFrom)
        .lte(dateField, filters.dateTo);

      if (filters.regime === 'caixa') {
        txQuery = txQuery.in('status', ['pago', 'recebido'] as any);
      }

      const { data: transactions, error: txErr } = await txQuery;
      if (txErr) throw txErr;

      // 3b. Fetch allocations for these transactions (for rateio)
      const txIds = (transactions ?? []).map((t: any) => t.id);
      let allocMap = new Map<string, { unit_id: string | null; percentage: number; amount: number | null; allocation_type: string }[]>();
      
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

      // 4. Map category_id -> dre_line_id
      const catToDre = new Map<string, string>();
      (categories ?? []).forEach((c: any) => {
        if (c.dre_line_id) catToDre.set(c.id, c.dre_line_id);
      });

      // 5. Sum by dre_line_id, considering allocations when filtering by unit
      const lineValues = new Map<string, number>();
      let _unallocTotal = 0;
      let _unallocCount = 0;
      (transactions ?? []).forEach((tx: any) => {
        if (!tx.category_id) return;
        const dreLineId = catToDre.get(tx.category_id);
        if (!dreLineId) return;
        const totalVal = Number(tx.net_amount) || 0;

        const allocs = allocMap.get(tx.id);
        
        if (filters.unit_id) {
          if (allocs && allocs.length > 0) {
            const unitAlloc = allocs.find(a => a.unit_id === filters.unit_id);
            if (unitAlloc) {
              let allocVal = 0;
              if (unitAlloc.allocation_type === 'percentual' && unitAlloc.percentage) {
                allocVal = totalVal * (unitAlloc.percentage / 100);
              } else if (unitAlloc.amount) {
                allocVal = Number(unitAlloc.amount);
              }
              lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + allocVal);
            }
          } else {
            if (tx.unit_id === filters.unit_id) {
              lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + totalVal);
            } else if (!tx.unit_id) {
              // Track unallocated transactions
              _unallocTotal += totalVal;
              _unallocCount++;
            }
          }
        } else {
          lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + totalVal);
        }
      });

      // 6. Build tree and calculate subtotals
      const allLines = dreLines ?? [];

      // Calculate depth
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

      // Calculate subtotals bottom-up
      // Cache computed values
      const computedValues = new Map<string, number>();
      const getLineValue = (line: any): number => {
        if (computedValues.has(line.id)) return computedValues.get(line.id)!;
        let val: number;
        if (!line.is_subtotal) {
          val = (lineValues.get(line.id) || 0) * (line.sign ?? 1);
        } else {
          const children = allLines.filter((c: any) => c.parent_id === line.id);
          if (children.length > 0) {
            val = children.reduce((sum: number, child: any) => sum + getLineValue(child), 0);
          } else {
            // Top-level result lines (3, 5, 8) with no children — compute from prior groups
            const code = line.code;
            if (code === '3') {
              // Resultado Bruto = Receitas + Despesas Variáveis
              const g1 = allLines.find((l: any) => l.code === '1');
              const g2 = allLines.find((l: any) => l.code === '2');
              val = (g1 ? getLineValue(g1) : 0) + (g2 ? getLineValue(g2) : 0);
            } else if (code === '5') {
              // Superávit Operacional = Resultado Bruto + Despesas Fixas
              const g3 = allLines.find((l: any) => l.code === '3');
              const g4 = allLines.find((l: any) => l.code === '4');
              val = (g3 ? getLineValue(g3) : 0) + (g4 ? getLineValue(g4) : 0);
            } else if (code === '8') {
              // Fluxo de Caixa Retido = Superávit + Entradas + Saídas
              const g5 = allLines.find((l: any) => l.code === '5');
              const g6 = allLines.find((l: any) => l.code === '6');
              const g7 = allLines.find((l: any) => l.code === '7');
              val = (g5 ? getLineValue(g5) : 0) + (g6 ? getLineValue(g6) : 0) + (g7 ? getLineValue(g7) : 0);
            } else {
              val = 0;
            }
          }
        }
        computedValues.set(line.id, val);
        return val;
      };

      const result: DreLineResult[] = allLines.map((l: any) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        sort_order: l.sort_order,
        is_subtotal: l.is_subtotal,
        sign: l.sign,
        parent_id: l.parent_id,
        value: getLineValue(l),
        depth: depthMap.get(l.id) || 0,
      }));

      setLines(result);
      setUnallocatedTotal(_unallocTotal);
      setUnallocatedCount(_unallocCount);
    } catch (err: any) {
      toast({ title: 'Erro ao gerar DRE', description: err.message, variant: 'destructive' });
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { lines, loading, generate, unallocatedTotal, unallocatedCount };
}
