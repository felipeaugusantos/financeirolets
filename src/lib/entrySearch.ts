/** Converte "1.234,56", "150", "-150,00", "R$ 12,5" em número; null se não for valor. */
export function parseSearchAmount(q: string): number | null {
  const s = q.trim().replace(/r\$\s*/i, '').replace(/\s/g, '');
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  let norm = s;
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, '');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Busca por texto (memo) ou por valor (com ou sem sinal; sem sinal compara o módulo). */
export function matchesEntrySearch(q: string, memo: string | null | undefined, amount: number): boolean {
  const text = q.trim().toLowerCase();
  if (!text) return true;
  if ((memo || '').toLowerCase().includes(text)) return true;
  const v = parseSearchAmount(text);
  if (v === null) return false;
  const a = Number(amount);
  if (text.trim().startsWith('-')) return Math.abs(a - v) < 0.005;
  return Math.abs(Math.abs(a) - Math.abs(v)) < 0.005;
}

/** Percentual de linhas decididas (vinculadas + ignoradas). */
export function reconciledPercent(entries: { status: string }[]) {
  const total = entries.length;
  const done = entries.filter(e => e.status !== 'pendente').length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
