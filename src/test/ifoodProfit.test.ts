import { describe, it, expect } from 'vitest';
import { profitIndicators, payoutReconciliation, weeklyStatement, cancelRate } from '@/lib/ifoodProfit';

const mk = (id: string, at: string, net: number, status = 'CONCLUDED') => ({ id, store_id: 's', ordered_at: at, status, delivery_fee: 5,
  financial: { gross_value: 100, commission: 10, payment_fee: 2, delivery_cost: 0, merchant_promo: 5, ifood_promo: 3, net_value: net, expected_payout_date: '2026-10-21' } });

describe('iFood — rentabilidade', () => {
  it('calcula os 5 indicadores sem contar cancelados', () => {
    const r = profitIndicators([mk('1', '2026-10-12T15:00:00Z', 80), mk('2', '2026-10-13T15:00:00Z', 80, 'CANCELLED')], { rider: 20, product: 30 });
    expect(r).toMatchObject({ gross: 100, discountStore: 5, discountIfood: 3, rider: 20, riderAfterFees: 15, product: 30, net: 80, left: 30, margin: 30 });
  });
  it('marca divergência acima de R$ 1 e sem crédito após a data', () => {
    const o = [mk('1', '2026-10-12T15:00:00Z', 80)];
    expect(payoutReconciliation(o, [{ id: 'b', posted_at: '2026-10-22', amount: 78, memo: 'PIX IFOOD' }], '2026-10-24')[0].status).toBe('divergente');
    expect(payoutReconciliation(o, [], '2026-10-24')[0].status).toBe('sem_credito');
    expect(payoutReconciliation(o, [], '2026-10-20')[0].status).toBe('a_receber');
  });
  it('taxa de cancelamento', () => {
    expect(cancelRate([mk('1', 'x', 1), mk('2', 'x', 1, 'CANCELLED')])).toBe(50);
  });
  it('agrupa vendas de 12 a 18/10 numa semana com repasse em 21/10 conferido', () => {
    const [w] = weeklyStatement([mk('1', '2026-10-12T15:00:00Z', 80), mk('2', '2026-10-18T20:00:00Z', 32.5)],
      [{ id: 'b', posted_at: '2026-10-21', amount: 112.5, memo: 'IFOOD' }], '2026-10-24');
    expect(w).toMatchObject({ start: '2026-10-12', end: '2026-10-18', orders: 2, gross: 200, commission: 20, paymentFee: 4, promo: 10, net: 112.5, payoutDate: '2026-10-21', received: 112.5, status: 'conferido' });
  });
});
