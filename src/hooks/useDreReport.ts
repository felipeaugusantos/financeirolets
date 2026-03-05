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
        .select('amount, tax_amount, net_amount, category_id, type, status')
        .gte(dateField, filters.dateFrom)
        .lte(dateField, filters.dateTo);

      if (filters.regime === 'caixa') {
        txQuery = txQuery.in('status', ['pago', 'recebido'] as any);
      }

      if (filters.unit_id) {
        txQuery = txQuery.eq('unit_id', filters.unit_id);
      }

      const { data: transactions, error: txErr } = await txQuery;
      if (txErr) throw txErr;

      // 4. Map category_id -> dre_line_id
      const catToDre = new Map<string, string>();
      (categories ?? []).forEach((c: any) => {
        if (c.dre_line_id) catToDre.set(c.id, c.dre_line_id);
      });

      // 5. Sum by dre_line_id
      const lineValues = new Map<string, number>();
      (transactions ?? []).forEach((tx: any) => {
        if (!tx.category_id) return;
        const dreLineId = catToDre.get(tx.category_id);
        if (!dreLineId) return;
        const val = Number(tx.net_amount) || 0;
        lineValues.set(dreLineId, (lineValues.get(dreLineId) || 0) + val);
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
