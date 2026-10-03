import { describe, it, expect } from 'vitest';
import { accountBalanceAt, buildOpeningMap, isAfterOpening } from '@/lib/finance';

const acc = { id: 'a', initial_balance: 1000, initial_balance_date: '2026-06-30' };
const rec = (payment_date: string | null, net_amount: number) => ({ type: 'receita', net_amount, payment_date });
const des = (payment_date: string | null, net_amount: number) => ({ type: 'despesa', net_amount, payment_date });

describe('saldo da conta com data-base (Fechamento)', () => {
  it('não soma movimento anterior nem igual à data-base', () => {
    const txs = [rec('2026-05-23', 500), des('2026-06-15', 200), rec('2026-06-30', 300)];
    expect(accountBalanceAt(acc, txs, '2026-10-01')).toBe(1000);
  });

  it('soma só o que vem depois da data-base, com sinal pelo tipo', () => {
    const txs = [rec('2026-07-01', 500), des('2026-07-02', 120.5)];
    expect(accountBalanceAt(acc, txs, '2026-10-01')).toBeCloseTo(1379.5, 2);
  });

  it('inclui o dia de referência e exclui o que vem depois dele', () => {
    const txs = [rec('2026-09-30', 100), rec('2026-10-01', 50), rec('2026-10-02', 999)];
    expect(accountBalanceAt(acc, txs, '2026-10-01')).toBe(1150);
  });

  it('ignora lançamento sem data de pagamento', () => {
    expect(accountBalanceAt(acc, [rec(null, 777)], '2026-10-01')).toBe(1000);
  });

  it('conta sem data-base soma todo o movimento (comportamento antigo)', () => {
    const semBase = { id: 'b', initial_balance: 0, initial_balance_date: null };
    expect(accountBalanceAt(semBase, [rec('2026-05-23', 100), des('2026-06-01', 40)], '2026-10-01')).toBe(60);
  });

  it('usa amount quando net_amount não vem preenchido e trata conta inexistente como zero', () => {
    expect(accountBalanceAt(acc, [{ type: 'receita', amount: 80, payment_date: '2026-07-10' }], '2026-10-01')).toBe(1080);
    expect(accountBalanceAt(undefined, [des('2026-07-10', 25)], '2026-10-01')).toBe(-25);
  });

  it('segue a mesma regra do Dashboard (isAfterOpening) para qualquer data', () => {
    const map = buildOpeningMap([acc]);
    const dates = ['2026-05-01', '2026-06-29', '2026-06-30', '2026-07-01', '2026-08-15', '2026-10-01'];
    const txs = dates.flatMap((d, i) => [rec(d, 10 + i), des(d, 3 + i)]);
    const esperado =
      1000 +
      txs
        .filter((t) => isAfterOpening({ account_id: 'a', payment_date: t.payment_date }, map))
        .reduce((s, t) => s + (t.type === 'receita' ? t.net_amount : -t.net_amount), 0);
    expect(accountBalanceAt(acc, txs, '2026-12-31')).toBeCloseTo(esperado, 2);
  });
});
