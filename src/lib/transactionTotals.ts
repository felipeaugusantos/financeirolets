/**
 * Totais de lançamentos.
 *
 * Regra de ouro: os cartões Receitas / Despesas / Saldo NUNCA podem ser somados
 * a partir das linhas já carregadas na tela — o backend limita a resposta a
 * 1.000 linhas e o total sairia truncado (e mudaria conforme o filtro de data).
 * Os totais vêm sempre da agregação de TODAS as linhas que atendem ao filtro,
 * lidas em páginas com `sumAllPages`.
 */

/** Tamanho máximo de página aceito pelo backend em uma única resposta. */
export const PAGE_SIZE = 1000;

/** Teto de segurança: 100 mil linhas por agregação (100 páginas). */
export const MAX_PAGES = 100;

export interface TotalsRow {
  id?: string;
  type: 'receita' | 'despesa' | string;
  net_amount: number | string | null;
  status?: string | null;
}

export interface Totals {
  receitas: number;
  despesas: number;
  saldo: number;
  /** Quantidade de linhas consideradas na agregação (já sem canceladas). */
  count: number;
  /** true quando o teto de páginas foi atingido e a agregação está incompleta. */
  truncated: boolean;
}

export const EMPTY_TOTALS: Totals = {
  receitas: 0, despesas: 0, saldo: 0, count: 0, truncated: false,
};

/** Lançamentos cancelados não entram em nenhum total. */
export const countsForTotals = (r: TotalsRow) => r.status !== 'cancelado';

/** Soma pura — usada tanto na agregação quanto na validação da tela. */
export function sumTotals(rows: TotalsRow[]): Totals {
  let receitas = 0;
  let despesas = 0;
  let count = 0;
  for (const r of rows) {
    if (!countsForTotals(r)) continue;
    const v = Number(r.net_amount) || 0;
    if (r.type === 'receita') receitas += v;
    else if (r.type === 'despesa') despesas += v;
    count++;
  }
  return {
    receitas: round2(receitas),
    despesas: round2(despesas),
    saldo: round2(receitas - despesas),
    count,
    truncated: false,
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Lê todas as páginas de uma consulta filtrada e devolve os totais agregados.
 * `fetchPage` recebe o intervalo [from, to] e devolve as linhas daquela página.
 */
export async function sumAllPages(
  fetchPage: (from: number, to: number) => Promise<TotalsRow[]>
): Promise<Totals> {
  const rows: TotalsRow[] = [];
  // Rede de proteção: se a mesma linha reaparecer em duas páginas (ordenação
  // instável no backend), ela é somada uma única vez.
  const seen = new Set<string>();
  let page = 0;
  let truncated = false;
  for (;;) {
    const chunk = await fetchPage(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    for (const r of chunk) {
      if (r.id) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
      }
      rows.push(r);
    }
    if (chunk.length < PAGE_SIZE) break;
    page++;
    if (page >= MAX_PAGES) { truncated = true; break; }
  }
  return { ...sumTotals(rows), truncated };
}

/** Tolerância de centavos usada na conferência tela × agregação. */
export const TOTALS_TOLERANCE = 0.01;

export interface TotalsCheck {
  ok: boolean;
  /** true quando a lista exibida é um recorte do total (não é divergência). */
  partialList: boolean;
  deltaReceitas: number;
  deltaDespesas: number;
  deltaSaldo: number;
}

/**
 * Confere os totais agregados contra a soma das linhas exibidas.
 * Quando a lista está paginada (`listComplete = false`) a diferença é esperada
 * e sinalizada como recorte — não como erro de cálculo.
 */
export function checkTotals(
  aggregated: Totals,
  visibleRows: TotalsRow[],
  listComplete: boolean
): TotalsCheck {
  const visible = sumTotals(visibleRows);
  const deltaReceitas = round2(aggregated.receitas - visible.receitas);
  const deltaDespesas = round2(aggregated.despesas - visible.despesas);
  const deltaSaldo = round2(aggregated.saldo - visible.saldo);
  const withinTolerance =
    Math.abs(deltaReceitas) <= TOTALS_TOLERANCE &&
    Math.abs(deltaDespesas) <= TOTALS_TOLERANCE &&
    Math.abs(deltaSaldo) <= TOTALS_TOLERANCE;
  return {
    ok: listComplete ? withinTolerance : true,
    partialList: !listComplete,
    deltaReceitas,
    deltaDespesas,
    deltaSaldo,
  };
}
