
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type TableName = 'units' | 'business_fronts' | 'accounts' | 'categories' | 'dre_lines' | 'partners';

export function useSupabaseCrud<T extends { id: string }>(table: TableName, orderBy = 'created_at') {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await (supabase.from(table) as any)
      .select('*')
      .order(orderBy);
    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } else {
      setData(rows ?? []);
    }
    setLoading(false);
  }, [table, orderBy]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (row: Partial<T>) => {
    const { error } = await (supabase.from(table) as any).insert(row);
    if (error) {
      toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Criado com sucesso' });
    await fetch();
    return true;
  };

  const update = async (id: string, row: Partial<T>) => {
    const { error } = await (supabase.from(table) as any).update(row).eq('id', id);
    if (error) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Atualizado com sucesso' });
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await (supabase.from(table) as any).delete().eq('id', id);
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
