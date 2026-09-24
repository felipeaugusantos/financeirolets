/**
 * Divisão padrão por categoria (independe do texto do extrato).
 * Ex.: toda despesa de "Energia" na conta Bradesco Café → 50% Café / 50% Fábrica.
 * A regra da conta específica vence a regra geral da categoria.
 */
export interface SplitLine {
  unit_id: string;
  percentage: number;
}

export interface CategorySplitRule {
  id: string;
  category_id: string;
  account_id: string | null;
  allocations: SplitLine[];
  notes?: string | null;
  active: boolean;
}

export function cleanSplit(lines: unknown): SplitLine[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter((l: any) => l && l.unit_id && Number(l.percentage) > 0)
    .map((l: any) => ({ unit_id: String(l.unit_id), percentage: Number(l.percentage) }));
}

export function splitTotal(lines: SplitLine[]): number {
  return Math.round(lines.reduce((s, l) => s + (Number(l.percentage) || 0), 0) * 100) / 100;
}

export function resolveCategorySplit(
  categoryId: string | null | undefined,
  accountId: string | null | undefined,
  rules: CategorySplitRule[],
): SplitLine[] | null {
  if (!categoryId) return null;
  const active = rules.filter(r => r.active && r.category_id === categoryId);
  const pick =
    (accountId && active.find(r => r.account_id === accountId)) ||
    active.find(r => !r.account_id);
  if (!pick) return null;
  const lines = cleanSplit(pick.allocations);
  return lines.length && Math.abs(splitTotal(lines) - 100) < 0.01 ? lines : null;
}

/** Divide 100% igualmente entre N unidades (o último absorve o arredondamento). */
export function evenSplit(unitIds: string[]): SplitLine[] {
  if (!unitIds.length) return [];
  const base = Math.floor((100 / unitIds.length) * 100) / 100;
  return unitIds.map((unit_id, i) => ({
    unit_id,
    percentage: i === unitIds.length - 1 ? +(100 - base * (unitIds.length - 1)).toFixed(2) : base,
  }));
}
