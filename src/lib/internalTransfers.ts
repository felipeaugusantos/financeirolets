/**
 * Detecção de transferências entre contas próprias.
 *
 * Quando o mesmo dinheiro sai de uma conta nossa e entra em outra, o extrato
 * mostra duas linhas espelhadas. Se cada uma virar um lançamento comum, o DRE
 * ganha uma receita e uma despesa que não existem. Aqui só *sugerimos* o par —
 * a decisão continua sendo do usuário.
 */

export interface TransferCandidateEntry {
  id: string;
  account_id: string;
  account_name: string;
  posted_at: string;
  amount: number;
  memo: string;
  status: string;
}

export interface TransferPair {
  /** Linha de saída (valor negativo). */
  out: TransferCandidateEntry;
  /** Linha de entrada (valor positivo). */
  in: TransferCandidateEntry;
  /** Diferença de dias entre as duas pernas. */
  dayGap: number;
  amount: number;
}

function days(a: string, b: string): number {
  return Math.round(
    Math.abs(Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 86400000
  );
}

/**
 * Pareia saídas com entradas de mesmo valor em contas diferentes, dentro de
 * uma janela de dias. Apenas correspondências únicas nos dois sentidos são
 * sugeridas; valores repetidos não podem escolher uma conta arbitrariamente.
 */
export function findInternalTransfers(
  entries: TransferCandidateEntry[],
  opts: { windowDays?: number } = {}
): TransferPair[] {
  const windowDays = opts.windowDays ?? 2;
  const outs = entries
    .filter(e => e.amount < 0 && e.status === 'pendente')
    .sort((a, b) => a.posted_at.localeCompare(b.posted_at));
  const ins = entries
    .filter(e => e.amount > 0 && e.status === 'pendente')
    .sort((a, b) => a.posted_at.localeCompare(b.posted_at));

  const pairs: TransferPair[] = [];
  const compatible = (o: TransferCandidateEntry, i: TransferCandidateEntry) =>
    i.account_id !== o.account_id &&
    Number.isFinite(o.amount) && Number.isFinite(i.amount) &&
    Math.round(i.amount * 100) === Math.round(Math.abs(o.amount) * 100) &&
    days(i.posted_at, o.posted_at) <= windowDays;

  for (const o of outs) {
    const target = Math.abs(o.amount);
    const matches = ins.filter(i => compatible(o, i));
    const match = matches[0];
    if (matches.length !== 1 || !match || outs.filter(other => compatible(other, match)).length !== 1) continue;
    pairs.push({ out: o, in: match, dayGap: days(match.posted_at, o.posted_at), amount: target });
  }

  return pairs.sort((a, b) => b.amount - a.amount);
}
