import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type AppRole = 'admin' | 'financeiro' | 'gerente_unidade' | 'operador' | 'vendedor';

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  gerente_unidade: 'Gerente de Unidade',
  operador: 'Operador',
  vendedor: 'Vendedor',
};

export const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'admin', label: ROLE_LABELS.admin },
  { value: 'financeiro', label: ROLE_LABELS.financeiro },
  { value: 'gerente_unidade', label: ROLE_LABELS.gerente_unidade },
  { value: 'operador', label: ROLE_LABELS.operador },
  { value: 'vendedor', label: ROLE_LABELS.vendedor },
];

export interface UserWithRoles {
  id: string;
  email: string | null;
  full_name: string;
  roles: AppRole[];
  unit_ids: string[];
}

export function useUserRoles() {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: uu, error: uErr }] =
      await Promise.all([
        supabase.from('profiles').select('id, email, full_name'),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('user_units').select('user_id, unit_id'),
      ]);

    if (pErr || rErr || uErr) {
      toast({
        title: 'Erro ao carregar usuários',
        description: pErr?.message || rErr?.message || uErr?.message,
        variant: 'destructive',
      });
      setUsers([]);
      setLoading(false);
      return;
    }

    const mapped: UserWithRoles[] = (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name || '(sem nome)',
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      unit_ids: (uu ?? []).filter((u) => u.user_id === p.id).map((u) => u.unit_id),
    }));
    setUsers(mapped);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const setRoles = async (userId: string, newRoles: AppRole[]) => {
    const { error: delErr } = await supabase.from('user_roles').delete().eq('user_id', userId);
    if (delErr) {
      toast({ title: 'Erro ao atualizar perfis', description: delErr.message, variant: 'destructive' });
      return false;
    }
    if (newRoles.length > 0) {
      const { error: insErr } = await supabase
        .from('user_roles')
        .insert(newRoles.map((role) => ({ user_id: userId, role })));
      if (insErr) {
        toast({ title: 'Erro ao salvar perfis', description: insErr.message, variant: 'destructive' });
        return false;
      }
    }
    toast({ title: 'Perfis atualizados' });
    await fetchAll();
    return true;
  };

  const setUnits = async (userId: string, unitIds: string[]) => {
    const { error: delErr } = await supabase.from('user_units').delete().eq('user_id', userId);
    if (delErr) {
      toast({ title: 'Erro ao atualizar unidades', description: delErr.message, variant: 'destructive' });
      return false;
    }
    if (unitIds.length > 0) {
      const { error: insErr } = await supabase
        .from('user_units')
        .insert(unitIds.map((unit_id) => ({ user_id: userId, unit_id })));
      if (insErr) {
        toast({ title: 'Erro ao salvar unidades', description: insErr.message, variant: 'destructive' });
        return false;
      }
    }
    toast({ title: 'Unidades atualizadas' });
    await fetchAll();
    return true;
  };

  return { users, loading, fetchAll, setRoles, setUnits };
}

export function useCurrentUserRoles() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (!cancelled) {
          setRoles([]);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', userData.user.id);
      if (!cancelled) {
        setRoles((data ?? []).map((r) => r.role as AppRole));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = roles.includes('admin');
  const isFinanceiro = roles.includes('financeiro');
  return { roles, loading, isAdmin, isFinanceiro };
}
