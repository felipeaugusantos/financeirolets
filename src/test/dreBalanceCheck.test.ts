import { describe, expect, it } from 'vitest';
import { dreBalanceCheck, type BalanceSnapshot } from '@/lib/dreBalanceCheck';

const accounts = [{ id: 'a', name: 'Banco A' }];
const snapshot = (ref_date: string, ledger_balance: number | null, checking_balance: number | null = null): BalanceSnapshot => ({ account_id: 'a', ref_date, ledger_balance, checking_balance, created_at: '2026-11-12T00:00:00Z' });
const run = (rows: BalanceSnapshot[], result: number | null = 200) => dreBalanceCheck(accounts, rows, '2026-10-01', '2026-10-31', result);
describe('Batimento de saldo do DRE', () => {
  it('compara saldo inicial mais DRE com saldo final, não saldo com resultado isolado', () => {
    expect(run([snapshot('2026-09-30', 1000), snapshot('2026-10-31', 1200)])).toMatchObject({ opening: 1000, closing: 1200, expected: 1200, deviation: 0 });
  });
  it('mostra desvio com sinal extrato menos esperado', () => {
    expect(run([snapshot('2026-09-30', 1000), snapshot('2026-10-31', 1180)]).deviation).toBe(-20);
  });
  it('não inventa saldo zero quando falta uma data', () => {
    expect(run([snapshot('2026-10-31', 1200)])).toMatchObject({ complete: false, deviation: null, expected: null, missing: ['Banco A'] });
  });
  it('não usa saldo antigo como se fosse saldo de fechamento', () => {
    expect(run([snapshot('2026-09-30', 1000), snapshot('2026-10-30', 1200)]).complete).toBe(false);
  });
  it('preserva saldo zero e usa saldo corrente quando não há ledger', () => {
    expect(run([snapshot('2026-09-30', 0, 500), snapshot('2026-10-31', null, 200)]).deviation).toBe(0);
  });
  it('não soma consultas duplicadas da mesma conta e data', () => {
    expect(run([snapshot('2026-09-30', 1000), snapshot('2026-10-31', 1200), { ...snapshot('2026-10-31', 1210), created_at: '2026-11-12T01:00:00Z' }]).deviation).toBe(10);
  });
  it('não apresenta batimento parcial como consolidado', () => {
    expect(dreBalanceCheck([...accounts, { id: 'b', name: 'Banco B' }], [snapshot('2026-09-30', 1000), snapshot('2026-10-31', 1200)], '2026-10-01', '2026-10-31', 200).deviation).toBeNull();
  });
  it('não substitui linha DRE ausente por resultado zero', () => {
    expect(run([snapshot('2026-09-30', 1000), snapshot('2026-10-31', 1200)], null).expected).toBeNull();
  });
});