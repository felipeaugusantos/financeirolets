import { describe, it, expect } from 'vitest';
import { deliveryDeadline } from '@/lib/crmRules';
import { ordersDemand } from '@/lib/factoryRules';

describe('Rotina pedido → fornada → distribuição', () => {
  it('pedidos viram cookies por unidade e produto', () => {
    expect(ordersDemand([
      { unit_id: 'a', items: [{ product_id: 'p', packages: 10, cookies_per_package: 6 }] },
      { unit_id: 'a', items: [{ product_id: 'p', packages: 2, cookies_per_package: 6 }, { product_id: 'q', packages: 1, cookies_per_package: 12 }] },
    ])).toEqual([{ unit_id: 'a', product_id: 'p', quantity: 72 }, { unit_id: 'a', product_id: 'q', quantity: 12 }]);
  });
  it('prazo de entrega', () => {
    expect(deliveryDeadline('2026-10-23', 'pendente', '2026-10-24')).toEqual({ kind: 'late', days: -1 });
    expect(deliveryDeadline('2026-10-24', 'em_producao', '2026-10-24').kind).toBe('today');
    expect(deliveryDeadline('2026-10-27', 'pendente', '2026-10-24')).toEqual({ kind: 'upcoming', days: 3 });
    expect(deliveryDeadline('2026-10-20', 'enviado', '2026-10-24').kind).toBe('done');
  });
});
