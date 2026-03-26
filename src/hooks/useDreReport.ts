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
      let allocMap = new Map<string, { unit_id: string | null; percentage: number; amount: number | null }[]>();
      
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
      (transactions ?? []).forEach((tx: any) => {
        if (!tx.category_id) return;
        const dreLineId = catToDre.get(tx.category_id);
        if (!dreLineId) return;
        const totalVal = Number(tx.net_amount) || 0;

        // Check if this tx has allocations
        const allocs = allocMap.get(tx.id);
        
        if (filters.unit_id) {
          // When filtering by unit, check allocations first
          if (allocs && allocs.length > 0) {
            // Get the proportion for this unit from allocations
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
            // If no allocation for this unit, tx is excluded from this unit's report
          } else {
            // No allocations — use direct unit_id match
            if (tx.unit_id === filters.unit_id) {
              lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + totalVal);
            }
          }
        } else {
          // No unit filter — use full value
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
      const getLineValue = (line: any): number => {
        if (!line.is_subtotal) {
          return (lineValues.get(line.id) || 0) * line.sign;
        }
        // Sum children
        const children = allLines.filter((c: any) => c.parent_id === line.id);
        return children.reduce((sum: number, child: any) => sum + getLineValue(child), 0);
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
    } catch (err: any) {
      toast({ title: 'Erro ao gerar DRE', description: err.message, variant: 'destructive' });
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { lines, loading, generate };
}
