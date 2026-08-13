/** Célula "crua": conteúdo inserido no CSV sem escape adicional.
 *  Usada para códigos (ex.: ="1.1") que o Excel não deve reinterpretar. */
export type CsvRaw = { raw: string };
export type CsvCell = string | number | CsvRaw;

const DELIMITER = ';';
const EOL = '\r\n';

const isRaw = (v: CsvCell): v is CsvRaw =>
  typeof v === 'object' && v !== null && 'raw' in v;

function escapeCell(v: CsvCell): string {
  if (isRaw(v)) return v.raw;
  const s = v === null || v === undefined ? '' : String(v);
  return s.includes(DELIMITER) || s.includes('"') || s.includes('\n') || s.includes('\r')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/** Número no padrão pt-BR: vírgula decimal, sem separador de milhar
 *  (evita ambiguidade com o delimitador e é lido corretamente pelo Excel pt-BR). */
export function csvNumber(v: number | null | undefined, decimals = 2): string {
  const n = Number(v);
  if (!isFinite(n)) return '';
  return n.toFixed(decimals).replace('.', ',');
}

/** Data ISO (yyyy-MM-dd) → dd/MM/yyyy, sem conversão de fuso. */
export function csvDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = String(iso).substring(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Códigos contábeis (1, 1.1, 01.10) protegidos contra conversão do Excel. */
export function csvCode(code: string | null | undefined): CsvCell {
  const s = (code ?? '').trim();
  if (!s) return '';
  return { raw: `="${s.replace(/"/g, '""')}"` };
}

/** Indentação preservada no Excel (espaços não-quebráveis). */
export function csvIndent(depth: number, text: string): string {
  return '\u00A0\u00A0\u00A0'.repeat(Math.max(0, depth)) + text;
}

export function exportToCsv(filename: string, headers: CsvCell[], rows: CsvCell[][]) {
  const csv = [
    headers.map(escapeCell).join(DELIMITER),
    ...rows.map(r => r.map(escapeCell).join(DELIMITER)),
  ].join(EOL) + EOL;

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
