/** CRM calculations are commercial estimates, never financial postings. */
export const CRM_STAGES = ['qualificacao', 'briefing', 'proposta', 'negociacao', 'ganha', 'perdida'] as const;
export type CrmStage = typeof CRM_STAGES[number];

export function crmConversion(won: number, lost: number): number | null {
  if (won < 0 || lost < 0 || !Number.isInteger(won) || !Number.isInteger(lost)) throw new Error('Contagem inválida');
  return won + lost === 0 ? null : won / (won + lost);
}

export function validateCrmStage(stage: CrmStage, lossReason?: string | null): boolean {
  return CRM_STAGES.includes(stage) && (stage !== 'perdida' || Boolean(lossReason?.trim()));
}

export function normalizeCompanyDocument(document: string): string | null {
  const digits = document.replace(/\D/g, '');
  return digits || null;
}
export const ORDER_STATUSES = ['pendente', 'em_producao', 'enviado', 'faturado', 'cancelado'] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];
export const PAYMENT_TERMS: Record<string, { label: string; days: number }> = {
  a_vista: { label: 'À vista', days: 0 },
  boleto_7: { label: 'Boleto 7 dias', days: 7 },
  boleto_14: { label: 'Boleto 14 dias', days: 14 },
  boleto_28: { label: 'Boleto 28 dias', days: 28 },
  pix: { label: 'PIX', days: 0 },
};

/** Vencimento = data base (entrega ou pedido) + prazo da condição. Datas ISO yyyy-mm-dd. */
export function orderDueDate(baseDate: string, terms: string): string {
  const days = PAYMENT_TERMS[terms]?.days ?? 0;
  const d = new Date(`${baseDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type OrderLike = { order_date: string; total_amount: number; quantity_boxes: number; status: string; company_id: string; active?: boolean };
const counts = (o: OrderLike) => o.status !== 'cancelado' && o.active !== false;

/** Mês até o dia X vs mesmo período do mês anterior (dia limitado ao último dia do mês anterior). */
export function monthToDateComparison(orders: OrderLike[], today: string) {
  const [y, m, d] = today.split('-').map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const lastPrev = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const curFrom = `${y}-${pad(m)}-01`, curTo = today;
  const prevFrom = `${prevY}-${pad(prevM)}-01`, prevTo = `${prevY}-${pad(prevM)}-${pad(Math.min(d, lastPrev))}`;
  const sum = (from: string, to: string) => orders.filter(o => counts(o) && o.order_date >= from && o.order_date <= to)
    .reduce((acc, o) => ({ amount: acc.amount + Number(o.total_amount), boxes: acc.boxes + Number(o.quantity_boxes), orders: acc.orders + 1 }), { amount: 0, boxes: 0, orders: 0 });
  const current = sum(curFrom, curTo), previous = sum(prevFrom, prevTo);
  const variation = previous.amount === 0 ? null : (current.amount - previous.amount) / previous.amount;
  return { current, previous, variation };
}

/** Empresas que compraram nos últimos 3 meses mas ainda não compraram no mês corrente. */
export function inactiveCustomers(orders: OrderLike[], today: string): string[] {
  const monthStart = `${today.slice(0, 7)}-01`;
  const d = new Date(`${monthStart}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 3);
  const windowStart = d.toISOString().slice(0, 10);
  const valid = orders.filter(counts);
  const bought = new Set(valid.filter(o => o.order_date >= monthStart && o.order_date <= today).map(o => o.company_id));
  const before = new Set(valid.filter(o => o.order_date >= windowStart && o.order_date < monthStart).map(o => o.company_id));
  return [...before].filter(id => !bought.has(id));
}

/** Média mensal de caixas e valor por cliente, considerando os meses com pedido. */
export function customerAverages(orders: OrderLike[]) {
  const map = new Map<string, { months: Set<string>; amount: number; boxes: number }>();
  orders.filter(counts).forEach(o => {
    const e = map.get(o.company_id) ?? { months: new Set(), amount: 0, boxes: 0 };
    e.months.add(o.order_date.slice(0, 7)); e.amount += Number(o.total_amount); e.boxes += Number(o.quantity_boxes);
    map.set(o.company_id, e);
  });
  return [...map].map(([company_id, e]) => ({ company_id, avgAmount: e.amount / e.months.size, avgBoxes: e.boxes / e.months.size, months: e.months.size }));
}
