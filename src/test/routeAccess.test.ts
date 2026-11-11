import { describe, expect, it } from 'vitest';
import { canAccessPath, rolesRequiredForPath } from '@/lib/routeAccess';

describe('routeAccess', () => {
  it('conciliação exige admin ou financeiro', () => {
    for (const p of ['/conciliacao', '/conciliacao/conciliar', '/conciliacao/cartao', '/conciliacao/regras', '/conciliacao/bancos']) {
      expect(canAccessPath(p, ['admin'])).toBe(true);
      expect(canAccessPath(p, ['financeiro'])).toBe(true);
      expect(canAccessPath(p, ['operador'])).toBe(false);
      expect(canAccessPath(p, ['gerente_unidade', 'vendedor'])).toBe(false);
      expect(canAccessPath(p, [])).toBe(false);
    }
  });
  it('auditoria é só admin', () => {
    expect(canAccessPath('/auditoria', ['admin'])).toBe(true);
    expect(canAccessPath('/auditoria', ['financeiro'])).toBe(false);
  });
  it('não casa prefixos parecidos e deixa as demais rotas abertas', () => {
    expect(rolesRequiredForPath('/conciliacaoX')).toBeNull();
    expect(canAccessPath('/', [])).toBe(true);
    expect(canAccessPath('/lancamentos', ['operador'])).toBe(true);
    expect(canAccessPath('/crm/agenda', ['vendedor'])).toBe(true);
  });
});
