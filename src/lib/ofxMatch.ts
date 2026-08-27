/**
 * Conciliação OFX × lançamentos.
 *
 * Regra de ouro: o extrato NUNCA cria lançamento sozinho. Aqui só calculamos
 * sugestões — a decisão (vincular, criar ou ignorar) é sempre do usuário.
 */

export interface StatementLine {
  id?: string;
  fitid: string;
  posted_at: string;
  amount: number;
  memo: string;
  trn_type?: string | null;
}

export interface CandidateTransaction {
  id: string;
  type: 'receita' | 'despesa';
  description: string;
  amount: number;
  net_amount: number | null;
  competence_date: string;
  due_date: string | null;
  payment_date: string | null;
  status: string;
  account_id: string | null;
  category_id: string | null;
  unit_id: string | null;
}

export type Confidence = 'alta' | 'media' | 'baixa';

export interface MatchSuggestion {
  transaction: CandidateTransaction;
  confidence: Confidence;
  /** Diferença de dias entre a data do extrato e a melhor data do lançamento. */
  dayGap: number;
  /** Diferença absoluta de valor (R$). */
  amountGap: number;
  reasons: string[];
}

const CENTS_TOLERANCE = 0.005;

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T12:00:00`);
  const db = Date.parse(`${b}T12:00:00`);
  return Math.round(Math.abs(da - db) / 86400000);
}

/** Normaliza texto para comparação: sem acento, sem pontuação, minúsculo. */
export function normalizeText(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quantas palavras significativas o extrato e o lançamento têm em comum. */
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(' ').filter(w => w.length >= 4));
  const tb = new Set(normalizeText(b).split(' ').filter(w => w.length >= 4));
  let hits = 0;
  ta.forEach(w => { if (tb.has(w)) hits++; });
  return hits;
}

/** Data que melhor representa o "dia no banco" de um lançamento. */
function bankDate(t: CandidateTransaction): string {
  return t.payment_date || t.due_date || t.competence_date;
}

/**
 * Sugere lançamentos compatíveis com uma linha do extrato.
 *
 * - alta: mesma conta, valor exato e até 1 dia de diferença (ou texto batendo).
 * - média: valor exato até 5 dias, ou valor com diferença de centavos até 2 dias.
 * - baixa: qualquer outro candidato dentro da janela.
 */
export function suggestMatches(
  line: StatementLine,
  accountId: string,
  transactions: CandidateTransaction[],
  opts: { windowDays?: number } = {}
): MatchSuggestion[] {
  const windowDays = opts.windowDays ?? 5;
  const expectedType: 'receita' | 'despesa' = line.amount >= 0 ? 'receita' : 'despesa';
  const target = Math.abs(line.amount);

  const out: MatchSuggestion[] = [];

  for (const t of transactions) {
    if (t.status === 'cancelado') continue;
    if (t.type !== expectedType) continue;

    const dayGap = daysBetween(line.posted_at, bankDate(t));
    if (dayGap > windowDays) continue;

    // O banco movimenta o valor líquido; comparamos com bruto e líquido.
    const gross = Math.abs(Number(t.amount) || 0);
    const net = Math.abs(Number(t.net_amount ?? t.amount) || 0);
    const amountGap = Math.min(Math.abs(gross - target), Math.abs(net - target));
    if (amountGap > 1) continue;

    const reasons: string[] = [];
    const exact = amountGap <= CENTS_TOLERANCE;
    const sameAccount = t.account_id === accountId;
    const overlap = tokenOverlap(line.memo, t.description);

    if (exact) reasons.push('valor idêntico');
    else reasons.push(`diferença de R$ ${amountGap.toFixed(2)}`);
    reasons.push(dayGap === 0 ? 'mesma data' : `${dayGap} dia(s) de diferença`);
    if (sameAccount) reasons.push('mesma conta');
    else if (t.account_id) reasons.push('conta diferente no sistema');
    else reasons.push('lançamento sem conta');
    if (overlap > 0) reasons.push(`${overlap} palavra(s) em comum na descrição`);

    let confidence: Confidence = 'baixa';
    if (exact && sameAccount && (dayGap <= 1 || overlap >= 1)) confidence = 'alta';
    else if (exact && dayGap <= windowDays) confidence = 'media';
    else if (!exact && dayGap <= 2) confidence = 'media';

    out.push({ transaction: t, confidence, dayGap, amountGap, reasons });
  }

  const rank: Record<Confidence, number> = { alta: 0, media: 1, baixa: 2 };
  return out
    .sort((a, b) =>
      rank[a.confidence] - rank[b.confidence] ||
      a.amountGap - b.amountGap ||
      a.dayGap - b.dayGap
    )
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// Regras por texto do memo
// ---------------------------------------------------------------------------

export interface OfxRule {
  id: string;
  pattern: string;
  match_type: 'contains' | 'regex';
  applies_to: 'receita' | 'despesa' | 'ambos';
  category_id: string | null;
  unit_id: string | null;
  front_id: string | null;
  partner_id: string | null;
  priority: number;
  active: boolean;
}

export interface RuleOutcome {
  rule: OfxRule;
  category_id: string | null;
  unit_id: string | null;
  front_id: string | null;
  partner_id: string | null;
}

/** Aplica a primeira regra ativa que casar com o memo (menor prioridade primeiro). */
export function applyRules(memo: string, amount: number, rules: OfxRule[]): RuleOutcome | null {
  const type: 'receita' | 'despesa' = amount >= 0 ? 'receita' : 'despesa';
  const haystack = normalizeText(memo);

  const ordered = [...rules]
    .filter(r => r.active && (r.applies_to === 'ambos' || r.applies_to === type))
    .sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    let hit = false;
    if (rule.match_type === 'regex') {
      try {
        hit = new RegExp(rule.pattern, 'i').test(memo);
      } catch {
        hit = false; // regra com regex inválida é ignorada, nunca quebra a importação
      }
    } else {
      hit = haystack.includes(normalizeText(rule.pattern));
    }
    if (hit) {
      return {
        rule,
        category_id: rule.category_id,
        unit_id: rule.unit_id,
        front_id: rule.front_id,
        partner_id: rule.partner_id,
      };
    }
  }
  return null;
}
