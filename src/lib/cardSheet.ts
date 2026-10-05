/**
 * Leitura de planilhas de fatura de cartão (Nubank, Porto Seguro, planilhas montadas à mão...).
 *
 * As planilhas reais fogem do formato "uma tabela com cabeçalho na linha 1":
 *  - o cabeçalho pode estar abaixo de títulos ("CARTÃO VISA INFINITY - VENC. 09/09");
 *  - há várias tabelas lado a lado (um bloco por cartão);
 *  - os nomes das colunas variam ("Dia", "O que é", "Lançamento", "Valor (R$)");
 *  - as datas vêm como "13 AGO" ou "05/03", sem o ano;
 *  - há linhas de total no fim e colunas de apoio (responsável, categoria, unidade).
 *
 * Tudo aqui é puro (sem xlsx, sem rede): recebe a matriz de células de cada aba e devolve os
 * lançamentos encontrados, para poder ser testado.
 */

export interface CardSheetRow {
  /** YYYY-MM-DD */
  posted_at: string;
  description: string;
  /** Valor exatamente como está na planilha (o sinal é decidido por quem importa). */
  raw_amount: number;
  /** Final do cartão (4 dígitos) ou rótulo curto do bloco, quando houver. */
  card: string | null;
  /** Texto da coluna logo à direita do valor (ex.: "Observação: INSUMO LOJA"). */
  note: string | null;
  /** Colunas de apoio sem cabeçalho (categoria e unidade já preenchidas pelo cliente). */
  categoryHint: string | null;
  unitHint: string | null;
}

export interface CardSheetBlock {
  sheet: string;
  /** Título acima da tabela, como está na planilha. */
  title: string | null;
  /** Rótulo curto do cartão deste bloco. */
  card: string | null;
  rows: CardSheetRow[];
  /** Linhas "total ..." encontradas (não são importadas; servem para conferir a soma). */
  totals: { label: string; amount: number }[];
  /** Linhas que tinham algo escrito mas não viraram lançamento. */
  ignored: number;
}

export interface CardSheetParse {
  blocks: CardSheetBlock[];
  warnings: string[];
}

export interface CardSheetInput {
  name: string;
  /** Células da aba, linha a linha (sheet_to_json com header: 1). */
  matrix: unknown[][];
}

// ---------------------------------------------------------------------------
// Texto, datas e valores
// ---------------------------------------------------------------------------

export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Monta YYYY-MM-DD só se o dia existir de verdade (rejeita 31/02). */
function isoIfValid(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Data sem ano ("13 AGO", "05/03"): usa o ano de `ref`; se o resultado cair mais de 31 dias
 * depois de `ref`, é do ano anterior (fatura de dezembro importada em janeiro).
 */
function inferYear(m: number, d: number, ref: Date): number {
  const y = ref.getFullYear();
  const candidate = Date.UTC(y, m - 1, d);
  return candidate > ref.getTime() + 31 * 86_400_000 ? y - 1 : y;
}

/**
 * Data de uma célula: Date, número serial do Excel, "dd/mm/aaaa", "dd/mm", "13 AGO",
 * "13 de agosto de 2026" ou "aaaa-mm-dd". Devolve YYYY-MM-DD ou null.
 */
export function parseSheetDate(value: unknown, ref: Date): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoIfValid(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 80_000) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return isoIfValid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return isoIfValid(+iso[1], +iso[2], +iso[3]);

  const br = text.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (br) {
    const d = +br[1];
    const m = +br[2];
    const y = br[3] ? (br[3].length === 2 ? 2000 + +br[3] : +br[3]) : inferYear(m, d, ref);
    return isoIfValid(y, m, d);
  }

  const pt = norm(text).match(/^(\d{1,2})\s*(?:de\s+)?([a-z]{3,9})\.?(?:\s*(?:de\s+)?(\d{4}))?$/);
  if (pt) {
    const m = MONTHS[pt[2].slice(0, 3)];
    if (!m) return null;
    const d = +pt[1];
    return isoIfValid(pt[3] ? +pt[3] : inferYear(m, d, ref), m, d);
  }
  return null;
}

/** "1.234,56", "1234.56", "R$ 12,00", "(12,00)" ou número → número. */
export function parseSheetAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  const negative = /^\(.*\)$/.test(raw);
  const text = raw.replace(/[^\d,.-]/g, '');
  if (!/\d/.test(text)) return null;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

// ---------------------------------------------------------------------------
// Detecção de blocos (cabeçalho + colunas)
// ---------------------------------------------------------------------------

const isDateHeader = (n: string) => /^(data|dia|date)\b/.test(n) || n === 'venda';
const isDescHeader = (n: string) =>
  ['descricao', 'lancamento', 'historico', 'estabelecimento', 'description', 'o que e', 'compra', 'local', 'detalhe']
    .some(k => n.includes(k));
const isAmountHeader = (n: string) => /^(valor|amount|montante)\b/.test(n);
const isCardHeader = (n: string) => ['final', 'cartao', 'card', 'ultimos'].some(k => n.includes(k));

interface BlockDef {
  headerRow: number;
  colDate: number;
  colDesc: number;
  colAmount: number;
}

const MAX_HEADER_SCAN = 40;
const MAX_BLOCK_WIDTH = 5;

/** Procura, nas primeiras linhas, o cabeçalho "data / descrição / valor" (pode haver vários lado a lado). */
function findBlocks(matrix: unknown[][]): BlockDef[] {
  for (let r = 0; r < Math.min(matrix.length, MAX_HEADER_SCAN); r++) {
    const row = matrix[r] ?? [];
    const found: BlockDef[] = [];
    for (let c = 0; c < row.length; c++) {
      if (!isDateHeader(norm(row[c]))) continue;
      let colDesc = -1;
      let colAmount = -1;
      for (let k = 1; k <= MAX_BLOCK_WIDTH && c + k < row.length; k++) {
        const n = norm(row[c + k]);
        if (isDateHeader(n)) break; // começa o bloco seguinte
        if (colDesc < 0 && isDescHeader(n)) colDesc = c + k;
        else if (colAmount < 0 && isAmountHeader(n)) colAmount = c + k;
        if (colDesc >= 0 && colAmount >= 0) break;
      }
      if (colDesc >= 0 && colAmount >= 0) {
        found.push({ headerRow: r, colDate: c, colDesc, colAmount });
        c = Math.max(colDesc, colAmount);
      }
    }
    if (found.length > 0) return found;
  }
  return [];
}

const cellText = (v: unknown) => (v == null ? '' : String(v).trim());

/** Rótulo curto do cartão a partir do título: "CARTÃO VISA INFINITY - VENC. 09/09" → "VISA INFINITY". */
export function cardLabelFromTitle(title: string | null): string | null {
  if (!title) return null;
  const last4 = title.match(/final\s*(\d{4})/i);
  if (last4) return last4[1];
  const label = title
    .replace(/^\s*cart[aã]o\s+/i, '')
    .replace(/\s*[-–]\s*venc.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return label ? label.slice(0, 40) : null;
}

/** Título do bloco: a célula acima do cabeçalho, na faixa do bloco, que fala de cartão (senão a mais próxima). */
function findTitle(matrix: unknown[][], def: BlockDef): string | null {
  let nearest: string | null = null;
  for (let r = def.headerRow - 1; r >= 0; r--) {
    for (let c = def.colDate; c <= def.colAmount; c++) {
      const t = cellText(matrix[r]?.[c]);
      if (!t) continue;
      if (/cart[aã]o|card|visa|master|elo\b|amex|hipercard/i.test(t)) return t;
      nearest ??= t;
    }
  }
  return nearest;
}

function parseBlock(
  sheet: string,
  matrix: unknown[][],
  def: BlockDef,
  nextColDate: number,
  ref: Date,
): CardSheetBlock {
  const header = matrix[def.headerRow] ?? [];
  const title = findTitle(matrix, def);
  const card = cardLabelFromTitle(title);

  // Colunas à direita do valor, até onde começa o próximo bloco.
  const limit = Math.min(nextColDate, def.colAmount + 4);
  const noteCol = def.colAmount + 1 < limit && cellText(header[def.colAmount + 1]) ? def.colAmount + 1 : -1;
  const noteLabel = noteCol >= 0 ? cellText(header[noteCol]) : '';
  // Colunas de apoio SEM cabeçalho: o cliente costuma digitar categoria e unidade ao lado do valor.
  const hintCols = [def.colAmount + 1, def.colAmount + 2].filter(c => c < limit && !cellText(header[c]));
  const [categoryCol, unitCol] = hintCols.length === 2 ? hintCols : [-1, -1];

  // Coluna "final do cartão" no cabeçalho (formato antigo: uma tabela com a coluna de cartão).
  const cardCol = header.findIndex((h, c) =>
    c !== def.colDate && c !== def.colDesc && c !== def.colAmount && c < limit && isCardHeader(norm(h)));

  const out: CardSheetBlock = { sheet, title, card, rows: [], totals: [], ignored: 0 };

  for (let r = def.headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const dateCell = row[def.colDate];
    const description = cellText(row[def.colDesc]);
    const amount = parseSheetAmount(row[def.colAmount]);
    const posted_at = parseSheetDate(dateCell, ref);

    if (!posted_at) {
      // Linha de total: o rótulo pode estar na coluna da data ou na da descrição.
      const label = description || cellText(dateCell);
      if (/^total\b/.test(norm(label)) && amount != null) out.totals.push({ label, amount });
      else if (label || amount != null) out.ignored++;
      continue;
    }
    if (!description || amount == null) { out.ignored++; continue; }

    const rowCard = cardCol >= 0 ? cellText(row[cardCol]).replace(/\D/g, '').slice(-4) || null : null;
    const note = noteCol >= 0 && cellText(row[noteCol]) ? `${noteLabel}: ${cellText(row[noteCol])}` : null;
    out.rows.push({
      posted_at,
      description,
      raw_amount: amount,
      card: rowCard ?? card,
      note,
      categoryHint: categoryCol >= 0 ? cellText(row[categoryCol]) || null : null,
      unitHint: unitCol >= 0 ? cellText(row[unitCol]) || null : null,
    });
  }
  return out;
}

/**
 * Lê as abas na ordem e usa a primeira que tiver pelo menos um bloco "data / descrição / valor".
 * Cada bloco é uma tabela (um cartão); várias tabelas lado a lado viram vários blocos.
 */
export function parseCardSheets(sheets: CardSheetInput[], ref: Date = new Date()): CardSheetParse {
  const warnings: string[] = [];
  for (const sheet of sheets) {
    const defs = findBlocks(sheet.matrix);
    if (defs.length === 0) continue;
    if (sheet !== sheets[0]) warnings.push(`A primeira aba não tinha tabela de lançamentos; foi usada a aba "${sheet.name}".`);
    const blocks = defs.map((def, i) =>
      parseBlock(sheet.name, sheet.matrix, def, defs[i + 1]?.colDate ?? Number.POSITIVE_INFINITY, ref));
    const usable = blocks.filter(b => b.rows.length > 0);
    if (usable.length === 0) {
      warnings.push(`Encontrei o cabeçalho na aba "${sheet.name}", mas nenhuma linha com data e valor válidos.`);
      return { blocks: [], warnings };
    }
    if (defs.length > 1) warnings.push(`${defs.length} tabelas encontradas lado a lado: uma por cartão.`);
    if (sheets.length > 1 && sheet === sheets[0]) {
      warnings.push(`Só a aba "${sheet.name}" foi lida; as demais abas foram ignoradas.`);
    }
    return { blocks: usable, warnings };
  }
  return { blocks: [], warnings };
}

// ---------------------------------------------------------------------------
// Linhas prontas para gravar
// ---------------------------------------------------------------------------

export type AmountSign = 'compras-positivas' | 'compras-negativas';

/**
 * Valor que fica gravado. No sistema, saída é negativa (despesa) e entrada é positiva (receita):
 * em fatura de cartão a compra costuma vir POSITIVA e o estorno NEGATIVO, então o sinal é invertido.
 */
export function storedAmount(rawAmount: number, sign: AmountSign): number {
  if (sign === 'compras-negativas') return rawAmount;
  return rawAmount === 0 ? 0 : -rawAmount;
}

export interface PreparedCardRow extends CardSheetRow {
  amount: number;
  /** Texto-base do hash; o chamador faz o SHA-1. */
  hashKey: string;
}

/**
 * Prepara as linhas para gravar e monta a chave do hash anti-duplicidade.
 *
 * Compras idênticas no mesmo dia (duas passagens de pedágio de R$ 9,12) são lançamentos diferentes:
 * a 2ª ocorrência dentro da mesma importação ganha o sufixo `|#2`, e assim por diante. A 1ª mantém
 * exatamente a chave antiga (`conta|data|descrição|valor|cartão`), então planilhas já importadas
 * continuam sendo reconhecidas, e reimportar a mesma planilha segue sem duplicar.
 */
export function prepareCardRows(
  blocks: CardSheetBlock[],
  accountId: string,
  sign: AmountSign,
): PreparedCardRow[] {
  const seen = new Map<string, number>();
  const out: PreparedCardRow[] = [];
  for (const block of blocks) {
    for (const row of block.rows) {
      const base = `${accountId}|${row.posted_at}|${row.description}|${row.raw_amount}|${row.card ?? ''}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      out.push({
        ...row,
        amount: storedAmount(row.raw_amount, sign),
        hashKey: n === 1 ? base : `${base}|#${n}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conferência com os totais da planilha e vínculo por nome
// ---------------------------------------------------------------------------

export interface TotalCheck {
  /** Soma das linhas do bloco, como na planilha. */
  sum: number;
  /** 'none' = a planilha não traz linha de total. */
  status: 'ok' | 'diff' | 'none';
  /** Total da planilha usado na comparação (o mais próximo da soma). */
  informed: number | null;
}

/**
 * Confere a soma das linhas com a(s) linha(s) "total ..." do bloco. Vale como "confere" quando algum
 * total é igual à soma, ou quando o total é a soma MAIS os outros totais do bloco (ex.: "total nacional"
 * que inclui o "total internacional" listado à parte).
 */
export function checkBlockTotal(block: CardSheetBlock): TotalCheck {
  const sum = Math.round(block.rows.reduce((s, r) => s + r.raw_amount, 0) * 100) / 100;
  if (block.totals.length === 0) return { sum, status: 'none', informed: null };
  const all = block.totals.reduce((s, t) => s + t.amount, 0);
  for (const t of block.totals) {
    const others = all - t.amount;
    if (Math.abs(t.amount - sum) < 0.01 || Math.abs(t.amount - (sum + others)) < 0.01) {
      return { sum, status: 'ok', informed: t.amount };
    }
  }
  const closest = [...block.totals].sort((a, b) => Math.abs(a.amount - sum) - Math.abs(b.amount - sum))[0];
  return { sum, status: 'diff', informed: closest.amount };
}

const slug = (s: unknown) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Acha o item de uma lista pelo nome digitado na planilha ("Materia Prima" → "Matéria-Prima",
 * "Boulevard" → "Let's Boulevard"). Só devolve quando há UM candidato; ambíguo ou ausente = null.
 */
export function matchByName<T extends { name: string }>(list: T[], hint: string | null | undefined): T | null {
  const h = slug(hint);
  if (h.length < 3) return null;
  const exact = list.filter(i => slug(i.name) === h);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = list.filter(i => {
    const n = slug(i.name);
    return n.includes(h) || h.includes(n);
  });
  return partial.length === 1 ? partial[0] : null;
}
