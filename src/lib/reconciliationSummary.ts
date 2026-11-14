import { reconciledPercent } from '@/lib/entrySearch';
import { accountBalanceAt } from '@/lib/finance';

export interface ReconciliationAccount {
  id: string;
  name: string;
  initial_balance: number;
  initial_balance_date: string | null;
}
export interface ReconciliationEntry { account_id: string; status: string; amount: number }
export interface ReconciliationSnapshot {
  account_id: string;
  ref_date: string;
  ledger_balance: number | null;
  checking_balance: number | null;
  created_at: string;
}
export interface ReconciliationTransaction {
  account_id: string | null;
  type: string;
  amount: number;
  net_amount: number | null;
  payment_date: string | null;
}
export type ClosingStatus = 'sem_extrato' | 'pendente' | 'sem_saldo' | 'divergente' | 'fechado';

/** Read-only summary of imported bank lines. A decided line is not proof of balance closure. */
export function reconciliationSummary(
  accounts: ReconciliationAccount[], entries: ReconciliationEntry[],
  snapshots: ReconciliationSnapshot[], transactions: ReconciliationTransaction[], to: string,
) {
  const ids = new Set(accounts.map(a => a.id));
  const scoped = entries.filter(e => ids.has(e.account_id));
  const pending = scoped.filter(e => e.status === 'pendente');
  const cents = (n: number) => Math.round(n * 100);
  const incoming = pending.reduce((s, e) => s + (e.amount > 0 ? cents(e.amount) : 0), 0) / 100;
  const outgoing = pending.reduce((s, e) => s + (e.amount < 0 ? cents(-e.amount) : 0), 0) / 100;
  const rows = accounts.map(account => {
    const lines = scoped.filter(e => e.account_id === account.id);
    const progress = reconciledPercent(lines);
    const pendingCount = lines.filter(e => e.status === 'pendente').length;
    const snapshot = snapshots.filter(s => s.account_id === account.id && s.ref_date === to)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const bank = snapshot?.ledger_balance ?? snapshot?.checking_balance ?? null;
    const hasOpening = !!account.initial_balance_date && account.initial_balance_date <= to;
    const system = hasOpening ? accountBalanceAt(account, transactions.filter(t => t.account_id === account.id), to) : null;
    const difference = bank !== null && system !== null ? (cents(bank) - cents(system)) / 100 : null;
    const status: ClosingStatus = !lines.length ? 'sem_extrato' : pendingCount > 0 ? 'pendente'
      : difference === null ? 'sem_saldo' : difference !== 0 ? 'divergente' : 'fechado';
    return { id: account.id, name: account.name, ...progress, pendingCount, difference, status };
  });
  return { ...reconciledPercent(scoped), pendingCount: pending.length, incoming, outgoing,
    pendingBalance: (cents(incoming) - cents(outgoing)) / 100,
    pendingVolume: (cents(incoming) + cents(outgoing)) / 100,
    rows, closedCount: rows.filter(r => r.status === 'fechado').length };
}