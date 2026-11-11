import type { AppRole } from '@/hooks/useUserRoles';

/**
 * Papéis exigidos por área. Espelha a RLS (docs/auditoria-rls.md): a leitura de conciliação é
 * Admin/Financeiro e a auditoria é só Admin. A RLS continua sendo a barreira real; isto só evita
 * telas quebradas/vazias e vazamento de navegação. Rotas fora da lista seguem abertas a qualquer logado.
 */
export const RECONCILIATION_ROLES: AppRole[] = ['admin', 'financeiro'];
export const ADMIN_ROLES: AppRole[] = ['admin'];

const RESTRICTED_PREFIXES: { prefix: string; roles: AppRole[] }[] = [
  { prefix: '/conciliacao', roles: RECONCILIATION_ROLES },
  { prefix: '/auditoria', roles: ADMIN_ROLES },
];

export function rolesRequiredForPath(pathname: string): AppRole[] | null {
  // O React Router casa rotas sem diferenciar maiúsculas; a checagem precisa fazer o mesmo.
  const path = pathname.toLowerCase();
  const hit = RESTRICTED_PREFIXES.find(
    ({ prefix }) => path === prefix || path.startsWith(`${prefix}/`),
  );
  return hit ? hit.roles : null;
}

export function canAccessPath(pathname: string, userRoles: AppRole[]): boolean {
  const required = rolesRequiredForPath(pathname);
  return !required || required.some((r) => userRoles.includes(r));
}
