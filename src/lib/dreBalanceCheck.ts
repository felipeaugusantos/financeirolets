export interface BalanceAccount { id: string; name: string }
export interface BalanceSnapshot {
  account_id: string;
  ref_date: string;
  ledger_balance: number | null;
  checking_balance: number | null;
  created_at: string;
}

/** Only bank-reported balances on the exact boundaries are comparable. */
export function dreBalanceCheck(accounts: BalanceAccount[], snapshots: BalanceSnapshot[], from: string, to: string, result: number | null) {
  const start = new Date(`${from}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const openingDate = start.toISOString().slice(0, 10);
  const at = (id: string, date: string) => snapshots
    .filter(s => s.account_id === id && s.ref_date === date && (s.ledger_balance ?? s.checking_balance) !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  let opening = 0;
  let closing = 0;
  const missing: string[] = [];
  for (const account of accounts) {
    const first = at(account.id, openingDate);
    const last = at(account.id, to);
    if (!first || !last) { missing.push(account.name); continue; }
    opening += Number(first.ledger_balance ?? first.checking_balance);
    closing += Number(last.ledger_balance ?? last.checking_balance);
  }
  const complete = accounts.length > 0 && missing.length === 0;
  const expected = complete && result !== null ? Math.round((opening + result) * 100) / 100 : null;
  const deviation = expected === null ? null : Math.round((closing - expected) * 100) / 100;
  return { openingDate, opening: complete ? opening : null, closing: complete ? closing : null, expected, deviation, missing, complete };
}