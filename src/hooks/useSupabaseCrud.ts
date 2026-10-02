
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type TableName = 'units' | 'business_fronts' | 'accounts' | 'categories' | 'dre_lines' | 'partners';

type CrudError = { message: string } | null;

/**
 * Visão mínima de `supabase.from(table)` para as 6 tabelas do CRUD genérico.
 * O builder tipado do Supabase não aceita um `table` em união (TS2589), então
 * esta interface é o ponto único de coerção.
 */
interface CrudTableApi {
  select(columns: string): { order(column: string): PromiseLike<{ data: unknown[] | null; error: CrudError }> };
  insert(row: unknown): { select(columns: string): { single(): PromiseLike<{ data: { id: string } | null; error: CrudError }> } };
  update(row: unknown): { eq(column: string, value: string): PromiseLike<{ error: CrudError }> };
  delete(): { eq(column: string, value: string): PromiseLike<{ error: CrudError }> };
}

export function useSupabaseCrud<T extends { id: string }>(table: TableName, orderBy = 'created_at') {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const tbl = useCallback(() => supabase.from(table) as unknown as CrudTableApi, [table]);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await tbl()
      .select('*')
      .order(orderBy);
    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } else {
      setData((rows ?? []) as T[]);
    }
    setLoading(false);
  }, [tbl, orderBy, toast]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (row: Partial<T>): Promise<string | false> => {
    const { data: inserted, error } = await tbl().insert(row).select('id').single();
    if (error) {
      toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Criado com sucesso' });
    await fetch();
    return inserted?.id ?? false;
  };

  const update = async (id: string, row: Partial<T>) => {
    const { error } = await tbl().update(row).eq('id', id);
    if (error) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Atualizado com sucesso' });
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await tbl().delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Excluído com sucesso' });
    await fetch();
    return true;
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    return update(id, { active: !currentActive } as unknown as Partial<T>);
  };

  return { data, loading, fetch, create, update, remove, toggleActive };
}
