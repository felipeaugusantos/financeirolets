import type { TransactionFilters as TFilters } from '@/hooks/useTransactions';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtros de Lançamentos vindos da URL, validados (parâmetro inválido é ignorado). */
export function filtersFromUrl(sp: URLSearchParams): TFilters {
  const f: TFilters = {};
  const type = sp.get('type');
  if (type === 'receita' || type === 'despesa') f.type = type;
  const status = sp.get('status');
  if (status && ['pendente', 'pago', 'recebido', 'cancelado', 'agendado'].includes(status)) f.status = status;
  const from = sp.get('dateFrom');
  const to = sp.get('dateTo');
  if (from && ISO_DATE.test(from)) f.dateFrom = from;
  if (to && ISO_DATE.test(to)) f.dateTo = to;
  for (const key of ['category_id', 'unit_id', 'front_id'] as const) {
    const v = sp.get(key);
    if (v && (UUID_RE.test(v) || v === '__null__')) f[key] = v;
  }
  const regime = sp.get('regime');
  if (regime === 'caixa' || regime === 'dashboard') f.regime = regime;
  return f;
}
