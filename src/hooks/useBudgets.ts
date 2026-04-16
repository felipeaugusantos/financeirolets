import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Budget {
  id: string;
  year: number;
  month: number;
  dre_line_id: string;
  unit_id: string | null;
  planned_amount: number;
  notes: string | null;
}

export function useBudgets(year: number, unitId: string | null) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('budgets')
        .select('id, year, month, dre_line_id, unit_id, planned_amount, notes')
        .eq('year', year);
      if (unitId) q = q.eq('unit_id', unitId);
      else q = q.is('unit_id', null);

      const { data, error } = await q;
      if (error) throw error;
      setBudgets((data ?? []) as Budget[]);
    } catch (err: any) {
      toast({ title: 'Erro ao buscar orçamento', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [year, unitId, toast]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const upsertBudget = useCallback(
    async (dreLineId: string, month: number, amount: number) => {
      try {
        const existing = budgets.find(b => b.dre_line_id === dreLineId && b.month === month);
        if (existing) {
          if (amount === 0) {
            const { error } = await supabase.from('budgets').delete().eq('id', existing.id);
            if (error) throw error;
            setBudgets(prev => prev.filter(b => b.id !== existing.id));
          } else {
            const { error } = await supabase
              .from('budgets')
              .update({ planned_amount: amount })
              .eq('id', existing.id);
            if (error) throw error;
            setBudgets(prev =>
              prev.map(b => (b.id === existing.id ? { ...b, planned_amount: amount } : b))
            );
          }
        } else if (amount !== 0) {
          const { data, error } = await supabase
            .from('budgets')
            .insert({
              year,
              month,
              dre_line_id: dreLineId,
              unit_id: unitId,
              planned_amount: amount,
            })
            .select()
            .single();
          if (error) throw error;
          setBudgets(prev => [...prev, data as Budget]);
        }
      } catch (err: any) {
        toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
      }
    },
    [budgets, year, unitId, toast]
  );

  const copyFromPreviousYear = useCallback(
    async (adjustPercent: number) => {
      setLoading(true);
      try {
        let q = supabase
          .from('budgets')
          .select('month, dre_line_id, planned_amount')
          .eq('year', year - 1);
        if (unitId) q = q.eq('unit_id', unitId);
        else q = q.is('unit_id', null);

        const { data: prev, error } = await q;
        if (error) throw error;

        if (!prev || prev.length === 0) {
          toast({ title: 'Sem dados', description: `Nenhum orçamento em ${year - 1}.` });
          return;
        }

        const factor = 1 + adjustPercent / 100;
        const rows = prev.map(p => ({
          year,
          month: p.month,
          dre_line_id: p.dre_line_id,
          unit_id: unitId,
          planned_amount: Number(p.planned_amount) * factor,
        }));

        const { error: upErr } = await supabase
          .from('budgets')
          .upsert(rows, { onConflict: unitId ? 'year,month,dre_line_id,unit_id' : 'year,month,dre_line_id' });
        if (upErr) throw upErr;

        toast({ title: 'Orçamento copiado', description: `${rows.length} linhas importadas.` });
        await fetchBudgets();
      } catch (err: any) {
        toast({ title: 'Erro ao copiar', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    },
    [year, unitId, fetchBudgets, toast]
  );

  return { budgets, loading, upsertBudget, copyFromPreviousYear, refetch: fetchBudgets };
}
