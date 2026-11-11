import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import { canAccessPath } from '@/lib/routeAccess';

/** Bloqueia a rota quando o papel do usuário não cobre o caminho (ver routeAccess.ts). */
export function RoleRoute({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { roles, loading } = useCurrentUserRoles();
  if (loading) return <p className="p-8 text-center text-muted-foreground">Carregando…</p>;
  if (!canAccessPath(pathname, roles)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Você não tem permissão para acessar esta área.
      </div>
    );
  }
  return <>{children}</>;
}
