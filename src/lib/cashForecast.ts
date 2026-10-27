/** Projeção de caixa a partir de contas em aberto (somente leitura, não lança nada). */
export interface OpenBill { type: string; net_amount: number | string; due_date: string | null }

export interface ForecastBucket { days: number; entradas: number; saidas: number; saldo: number }
export interface CashForecast { atrasadoEntradas: number; atrasadoSaidas: number; buckets: ForecastBucket[] }

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Cada horizonte é acumulado: D+15 inclui o que vence até D+7. Vencidos ficam à parte. */
export function buildCashForecast(bills: OpenBill[], today: string, horizons = [7, 15, 30]): CashForecast {
  let atrasadoEntradas = 0, atrasadoSaidas = 0;
  const buckets = horizons.map((days) => ({ days, entradas: 0, saidas: 0, saldo: 0 }));
  for (const b of bills) {
    if (!b.due_date) continue;
    const v = Math.abs(Number(b.net_amount) || 0);
    const isIn = b.type === 'receita';
    if (b.due_date < today) {
      if (isIn) atrasadoEntradas += v; else atrasadoSaidas += v;
      continue;
    }
    for (const bk of buckets) {
      if (b.due_date <= addDays(today, bk.days)) {
        if (isIn) bk.entradas += v; else bk.saidas += v;
      }
    }
  }
  for (const bk of buckets) bk.saldo = bk.entradas - bk.saidas;
  return { atrasadoEntradas, atrasadoSaidas, buckets };
}
