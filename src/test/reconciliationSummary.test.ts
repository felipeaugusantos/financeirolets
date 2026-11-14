import { describe, expect, it } from 'vitest';
import { reconciliationSummary } from '@/lib/reconciliationSummary';

const account = { id: 'a', name: 'Loja', initial_balance: 100, initial_balance_date: '2026-10-31' };
const to = '2026-11-30';
const line = (status: string, amount = 10, account_id = 'a') => ({ account_id, status, amount });
const snapshot = { account_id: 'a', ref_date: to, ledger_balance: 100, checking_balance: null, created_at: '2026-12-01' };

describe('Executive reconciliation', () => {
  it('uses the panel progress: linked and ignored lines count as resolved', () => {
    const r = reconciliationSummary([account], [line('vinculado'), line('ignorado'), line('pendente')], [], [], to);
    expect(r.pct).toBe(67); expect(r.done).toBe(2); expect(r.pendingCount).toBe(1);
  });
  it('does not confuse offsetting pending entries with closure', () => {
    const r = reconciliationSummary([account], [line('pendente', 250), line('pendente', -250)], [snapshot], [], to);
    expect(r.pendingBalance).toBe(0); expect(r.pendingVolume).toBe(500);
    expect(r.incoming).toBe(250); expect(r.outgoing).toBe(250); expect(r.rows[0].status).toBe('pendente');
  });
  it('only closes when every line is resolved and bank and system balances match', () => {
    const r = reconciliationSummary([account], [line('vinculado')], [snapshot], [], to);
    expect(r.closedCount).toBe(1); expect(r.rows[0].difference).toBe(0);
  });
  it('cannot close with a missing or stale bank snapshot', () => {
    expect(reconciliationSummary([account], [line('vinculado')], [{ ...snapshot, ref_date: '2026-11-29' }], [], to).rows[0].status).toBe('sem_saldo');
  });
  it('requires a configured opening date rather than assuming missing balances are zero', () => {
    expect(reconciliationSummary([{ ...account, initial_balance_date: null }], [line('ignorado')], [snapshot], [], to).rows[0].status).toBe('sem_saldo');
  });
  it('shows balance deviations even with 100 percent resolved', () => {
    const r = reconciliationSummary([account], [line('vinculado')], [{ ...snapshot, ledger_balance: 90 }], [], to);
    expect(r.pct).toBe(100); expect(r.rows[0].difference).toBe(-10); expect(r.rows[0].status).toBe('divergente');
  });
  it('does not claim closure without imported lines', () => {
    const r = reconciliationSummary([account], [], [snapshot], [], to);
    expect(r.pct).toBe(0); expect(r.closedCount).toBe(0); expect(r.rows[0].status).toBe('sem_extrato');
  });
  it('only includes entries of the scoped accounts', () => {
    const r = reconciliationSummary([account], [line('vinculado'), line('pendente', 500, 'other')], [snapshot], [], to);
    expect(r.total).toBe(1); expect(r.pendingVolume).toBe(0);
  });
  it('uses cash movements after opening, including both transfer legs in their accounts', () => {
    const txs = [{ account_id: 'a', type: 'despesa', amount: 30, net_amount: 30, payment_date: '2026-11-05' },
      { account_id: 'a', type: 'receita', amount: 999, net_amount: 999, payment_date: '2026-10-31' }];
    const r = reconciliationSummary([account], [line('vinculado')], [{ ...snapshot, ledger_balance: 70 }], txs, to);
    expect(r.rows[0].difference).toBe(0); expect(r.closedCount).toBe(1);
  });
  it('cannot close all accounts when a second account has no statement', () => {
    const r = reconciliationSummary([account, { ...account, id: 'b' }], [line('vinculado')], [snapshot], [], to);
    expect(r.closedCount).toBe(1); expect(r.rows).toHaveLength(2);
  });
});