/**
 * Motor único de totais do DRE. Ordem de prioridade por linha:
 *  1. `formula` cadastrada (ex.: "1+2", "C3+C4", "5+5.1+6+7");
 *  2. soma dos filhos, para subtotais com filhos;
 *  3. regra antiga fixa (grupos 3, 5 e 8) — só enquanto a linha não tiver fórmula;
 *  4. valor lançado × sinal, para linhas analíticas.
 * Fórmula circular vale 0 e o código da linha entra em `circular`.
 */
export interface DreTotalLine {
  id: string;
  code: string | null;
  parent_id: string | null;
  is_subtotal: boolean;
  sign: number | null;
  formula?: string | null;
}

export const LEGACY_FORMULAS: Record<string, string> = {
  '3': '1+2',
  '5': '3+4',
  // Pró-labore (5.1) fica fora do resultado operacional, mas impacta o caixa retido.
  '8': '5+5.1+6+7',
};

export function parseFormula(formula: string): { code: string; negative: boolean }[] {
  return (String(formula).match(/[+-]?[^+-]+/g) ?? [])
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((t) => ({ negative: t.startsWith('-'), code: t.replace(/^[+-]/, '').trim() }));
}

export function resolveDreTotals<L extends DreTotalLine>(allLines: L[], lineValues: Map<string, number>) {
  const byCode = new Map<string, L>();
  allLines.forEach((l) => { if (l.code) byCode.set(l.code, l); });
  const childrenOf = new Map<string, L[]>();
  allLines.forEach((l) => {
    if (!l.parent_id) return;
    const list = childrenOf.get(l.parent_id) || [];
    list.push(l);
    childrenOf.set(l.parent_id, list);
  });
  const values = new Map<string, number>();
  const visiting = new Set<string>();
  const circular = new Set<string>();

  const evalFormula = (f: string) =>
    parseFormula(f).reduce((sum, t) => {
      const ref = byCode.get(t.code);
      if (!ref) return sum;
      const v = get(ref);
      return sum + (t.negative ? -v : v);
    }, 0);

  const get = (line: L): number => {
    if (values.has(line.id)) return values.get(line.id)!;
    if (visiting.has(line.id)) {
      circular.add(line.code ?? line.id);
      return 0;
    }
    visiting.add(line.id);
    let val = 0;
    const children = childrenOf.get(line.id) || [];
    if (line.formula) {
      val = evalFormula(line.formula);
    } else if (line.is_subtotal && children.length > 0) {
      val = children.reduce((s, c) => s + get(c), 0);
    } else if (line.is_subtotal && line.code && LEGACY_FORMULAS[line.code]) {
      val = evalFormula(LEGACY_FORMULAS[line.code]);
    } else if (!line.is_subtotal) {
      val = (lineValues.get(line.id) || 0) * (line.sign ?? 1);
    }
    visiting.delete(line.id);
    if (circular.has(line.code ?? line.id)) val = 0;
    values.set(line.id, val);
    return val;
  };

  allLines.forEach((l) => get(l));
  return { values, circular: [...circular] };
}
