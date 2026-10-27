import { describe, it, expect } from 'vitest';
import { buildCashForecast } from '@/lib/cashForecast';

const today = '2026-10-27';

describe('buildCashForecast', () => {
  it('acumula por horizonte D+7, D+15, D+30', () => {
    const f = buildCashForecast([
      { type: 'receita', net_amount: 1000, due_date: '2026-11-03' }, // D+7
      { type: 'despesa', net_amount: 400, due_date: '2026-11-10' }, // D+14
      { type: 'despesa', net_amount: 300, due_date: '2026-11-26' }, // D+30
      { type: 'receita', net_amount: 999, due_date: '2026-11-27' }, // fora
    ], today);
    expect(f.buckets.map((b) => b.saldo)).toEqual([1000, 600, 300]);
  });

  it('separa vencidos e ignora sem vencimento', () => {
    const f = buildCashForecast([
      { type: 'despesa', net_amount: 250, due_date: '2026-10-20' },
      { type: 'receita', net_amount: 80, due_date: null },
    ], today);
    expect(f.atrasadoSaidas).toBe(250);
    expect(f.buckets[2].entradas).toBe(0);
  });
});
