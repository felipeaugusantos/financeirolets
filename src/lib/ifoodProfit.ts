// Cálculos da tela iFood (modo sombra): só leitura, nunca lança no financeiro/DRE.
export interface IfoodFinancial { gross_value: number; commission: number; payment_fee: number; delivery_cost: number; merchant_promo: number; ifood_promo: number; net_value: number; expected_payout_date: string | null }
export interface IfoodOrderRow { id: string; store_id: string; ordered_at: string | null; status: string | null; delivery_fee: number; financial: IfoodFinancial | null }
export interface BankLine { id: string; posted_at: string; amount: number; memo: string | null }
export type PayoutStatus = 'conferido' | 'divergente' | 'sem_credito' | 'a_receber';

const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
export const isCancelled = (s: string | null) => /CANCEL/i.test(s ?? '');
export const addDays = (iso: string, d: number) => { const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const weekStart = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const spDate = (ts: string) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** 5 indicadores: faturamento, descontos (loja/iFood), motoqueiro, produto, líquido recebido. */
export function profitIndicators(orders: IfoodOrderRow[], costs: { rider: number; product: number }) {
  const ok = orders.filter(o => !isCancelled(o.status));
  const f = ok.map(o => o.financial).filter(Boolean) as IfoodFinancial[];
  const gross = r2(f.reduce((s, x) => s + n(x.gross_value), 0));
  const deliveryFees = r2(ok.reduce((s, o) => s + n(o.delivery_fee), 0));
  const net = r2(f.reduce((s, x) => s + n(x.net_value), 0));
  const left = r2(net - costs.rider - costs.product);
  return {
    gross,
    discountStore: r2(f.reduce((s, x) => s + n(x.merchant_promo), 0)),
    discountIfood: r2(f.reduce((s, x) => s + n(x.ifood_promo), 0)),
    rider: r2(costs.rider), riderAfterFees: r2(costs.rider - deliveryFees),
    product: r2(costs.product),
    net, left, margin: gross ? r2((left / gross) * 100) : 0,
    missingFinancial: ok.length - f.length,
  };
}

/** Repasse previsto por data x créditos "iFood" no extrato até 3 dias depois. Diferença > R$1 = divergente. */
export function payoutReconciliation(orders: IfoodOrderRow[], bank: BankLine[], today: string) {
  const byDate = new Map<string, number>();
  orders.filter(o => !isCancelled(o.status) && o.financial?.expected_payout_date).forEach(o => {
    const d = o.financial!.expected_payout_date!; byDate.set(d, n(byDate.get(d)) + n(o.financial!.net_value));
  });
  const credits = bank.filter(b => b.amount > 0 && /ifood/i.test(b.memo ?? ''));
  const used = new Set<string>();
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, exp]) => {
    const expected = r2(exp);
    const hits = credits.filter(c => !used.has(c.id) && c.posted_at >= date && c.posted_at <= addDays(date, 3));
    hits.forEach(c => used.add(c.id));
    const received = r2(hits.reduce((s, c) => s + n(c.amount), 0));
    const status: PayoutStatus = hits.length ? (Math.abs(received - expected) > 1 ? 'divergente' : 'conferido') : date > today ? 'a_receber' : 'sem_credito';
    return { date, expected, received, diff: r2(received - expected), status };
  });
}

/** Extrato semanal (vendas de segunda a domingo) com repasse conferido no extrato. */
export function weeklyStatement(orders: IfoodOrderRow[], bank: BankLine[], today: string) {
  const payouts = new Map(payoutReconciliation(orders, bank, today).map(p => [p.date, p]));
  const weeks = new Map<string, { gross: number; commission: number; paymentFee: number; promo: number; net: number; orders: number; dates: Set<string> }>();
  orders.filter(o => !isCancelled(o.status) && o.ordered_at && o.financial).forEach(o => {
    const k = weekStart(spDate(o.ordered_at!)), f = o.financial!;
    const w = weeks.get(k) ?? { gross: 0, commission: 0, paymentFee: 0, promo: 0, net: 0, orders: 0, dates: new Set<string>() };
    w.gross += n(f.gross_value); w.commission += n(f.commission); w.paymentFee += n(f.payment_fee); w.promo += n(f.merchant_promo); w.net += n(f.net_value); w.orders++;
    if (f.expected_payout_date) w.dates.add(f.expected_payout_date);
    weeks.set(k, w);
  });
  return [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([start, w]) => {
    const linked = [...w.dates].map(d => payouts.get(d)).filter(Boolean) as ReturnType<typeof payoutReconciliation>;
    const received = r2(linked.reduce((s, p) => s + p.received, 0));
    const status: PayoutStatus = !linked.length ? 'a_receber'
      : linked.some(p => p.status === 'divergente') ? 'divergente'
      : linked.some(p => p.status === 'sem_credito') ? 'sem_credito'
      : linked.every(p => p.status === 'conferido') ? 'conferido' : 'a_receber';
    return { start, end: addDays(start, 6), orders: w.orders, gross: r2(w.gross), commission: r2(w.commission), paymentFee: r2(w.paymentFee), promo: r2(w.promo), net: r2(w.net), payoutDate: [...w.dates].sort().at(-1) ?? null, received, status };
  });
}

export const cancelRate = (orders: IfoodOrderRow[]) => orders.length ? r2((orders.filter(o => isCancelled(o.status)).length / orders.length) * 100) : 0;
