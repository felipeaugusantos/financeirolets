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
  tax_amount?: number | null;
  competence_date: string;
  due_date: string | null;
  payment_date: string | null;
  status: string;
  account_id: string | null;
  category_id: string | null;
  unit_id: string | null;
  partner_id?: string | null;
  partner_name?: string | null;
}

export type Confidence = 'alta' | 'media' | 'baixa';

/** Como a diferença de valor entre extrato e lançamento foi explicada. */
export type AmountBasis =
  | 'exato'
  | 'liquido'
  | 'bruto'
  | 'taxa'
  | 'juros'
  | 'aproximado';

export interface MatchSuggestion {
  transaction: CandidateTransaction;
  confidence: Confidence;
  /** Diferença de dias entre a data do extrato e a melhor data do lançamento. */
  dayGap: number;
  /** Diferença absoluta de valor (R$) contra a melhor base comparada. */
  amountGap: number;
  /** Base que melhor explicou o valor do extrato. */
  basis: AmountBasis;
  /** Pontuação interna (0-100), usada para ordenar. */
  score: number;
  reasons: string[];
}

const CENTS_TOLERANCE = 0.005;
/** Taxa de adquirente/tarifa aceitável: até 6% do valor e no máximo R$ 500. */
const FEE_MAX_PCT = 0.06;
const FEE_MAX_ABS = 500;
/** Juros/multa por atraso: até 12% do valor. */
const INTEREST_MAX_PCT = 0.12;

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T12:00:00`);
  const db = Date.parse(`${b}T12:00:00`);
  return Math.round(Math.abs(da - db) / 86400000);
}

function isAfter(a: string, b: string): boolean {
  return Date.parse(`${a}T12:00:00`) > Date.parse(`${b}T12:00:00`);
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

/**
 * Palavras que aparecem em quase todo memo bancário e não ajudam a identificar
 * a contraparte. Removê-las evita casar "PIX ENVIADO" com "PIX RECEBIDO".
 */
const STOP_WORDS = new Set([
  'pix', 'ted', 'doc', 'transferencia', 'transf', 'pagamento', 'pgto', 'recebido',
  'enviado', 'debito', 'credito', 'conta', 'banco', 'boleto', 'cobranca', 'liquidacao',
  'compra', 'cartao', 'lancamento', 'valor', 'ref', 'referente', 'para', 'nome',
  'ltda', 'me', 'epp', 'sa', 'eireli', 'cnpj', 'cpf', 'des', 'via',
]);

function tokens(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/** Quantas palavras significativas o extrato e o lançamento têm em comum. */
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  let hits = 0;
  ta.forEach(w => { if (tb.has(w)) hits++; });
  return hits;
}

/** Similaridade de Dice por bigramas — pega memo abreviado ou com grafia diferente. */
export function textSimilarity(a: string, b: string): number {
  const na = tokens(a).join(' ');
  const nb = tokens(b).join(' ');
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let shared = 0;
  ba.forEach((count, g) => { shared += Math.min(count, bb.get(g) ?? 0); });
  const total = (na.length - 1) + (nb.length - 1);
  return total > 0 ? (2 * shared) / total : 0;
}

/** Data que melhor representa o "dia no banco" de um lançamento. */
function bankDate(t: CandidateTransaction): string {
  return t.payment_date || t.due_date || t.competence_date;
}

interface AmountVerdict {
  gap: number;
  basis: AmountBasis;
  reason: string;
  /** Peso 0-1 de quão bem o valor foi explicado. */
  quality: number;
}

/**
 * Compara o valor do extrato com todas as leituras possíveis do lançamento:
 * bruto, líquido, bruto menos impostos e bruto mais impostos. O que sobrar é
 * testado como taxa de adquirente (a menos) ou juros/multa (a mais).
 */
function explainAmount(
  target: number,
  t: CandidateTransaction,
  line: StatementLine
): AmountVerdict | null {
  const gross = Math.abs(Number(t.amount) || 0);
  const netField = Math.abs(Number(t.net_amount ?? t.amount) || 0);
  const tax = Math.abs(Number(t.tax_amount ?? 0) || 0);

  const bases: { value: number; basis: AmountBasis; reason: string }[] = [
    { value: gross, basis: 'bruto', reason: 'valor bruto idêntico' },
    { value: netField, basis: 'liquido', reason: 'bate com o valor líquido do lançamento' },
  ];
  if (tax > 0) {
    bases.push({ value: gross - tax, basis: 'liquido', reason: `bruto menos impostos/taxas (R$ ${tax.toFixed(2)})` });
    bases.push({ value: gross + tax, basis: 'liquido', reason: `bruto mais impostos/taxas (R$ ${tax.toFixed(2)})` });
  }

  let best: AmountVerdict | null = null;
  for (const b of bases) {
    const gap = Math.abs(b.value - target);
    if (gap <= CENTS_TOLERANCE) {
      const exactBasis: AmountBasis = b.basis === 'bruto' ? 'exato' : 'liquido';
      const verdict: AmountVerdict = {
        gap,
        basis: exactBasis,
        reason: exactBasis === 'exato' ? 'valor idêntico' : b.reason,
        quality: exactBasis === 'exato' ? 1 : 0.92,
      };
      if (!best || verdict.quality > best.quality) best = verdict;
    }
  }
  if (best) return best;

  // Nenhuma base bateu na vírgula: tenta explicar a sobra.
  const diff = target - gross;          // > 0: banco recebeu/pagou mais que o lançamento
  const absDiff = Math.abs(diff);
  const pct = gross > 0 ? absDiff / gross : 1;

  if (diff < 0 && pct <= FEE_MAX_PCT && absDiff <= FEE_MAX_ABS) {
    return {
      gap: absDiff,
      basis: 'taxa',
      reason: `R$ ${absDiff.toFixed(2)} a menos (${(pct * 100).toFixed(2)}%) — compatível com taxa de adquirente/tarifa`,
      quality: 0.75,
    };
  }

  const due = t.due_date || t.competence_date;
  const late = isAfter(line.posted_at, due);
  if (diff > 0 && pct <= INTEREST_MAX_PCT && (late || absDiff <= 50)) {
    return {
      gap: absDiff,
      basis: 'juros',
      reason: late
        ? `R$ ${absDiff.toFixed(2)} a mais e pago após o vencimento — compatível com juros/multa`
        : `R$ ${absDiff.toFixed(2)} a mais — possível acréscimo/tarifa`,
      quality: 0.6,
    };
  }

  // Diferença pequena de arredondamento.
  if (absDiff <= 1) {
    return { gap: absDiff, basis: 'aproximado', reason: `diferença de R$ ${absDiff.toFixed(2)}`, quality: 0.5 };
  }

  return null;
}

/**
 * Sugere lançamentos compatíveis com uma linha do extrato.
 *
 * O valor pode ser explicado por bruto, líquido, taxa de adquirente ou
 * juros/multa; a data entra como janela; e o texto usa similaridade fuzzy
 * (mais o nome do parceiro), para achar a contraparte mesmo com memo fora
 * do padrão. Nada é aplicado automaticamente — é só ranking.
 */
export function suggestMatches(
  line: StatementLine,
  accountId: string,
  transactions: CandidateTransaction[],
  opts: { windowDays?: number } = {}
): MatchSuggestion[] {
  const windowDays = opts.windowDays ?? 7;
  const expectedType: 'receita' | 'despesa' = line.amount >= 0 ? 'receita' : 'despesa';
  const target = Math.abs(line.amount);

  const out: MatchSuggestion[] = [];

  for (const t of transactions) {
    if (t.status === 'cancelado') continue;
    if (t.type !== expectedType) continue;

    const dayGap = daysBetween(line.posted_at, bankDate(t));
    if (dayGap > windowDays) continue;

    const verdict = explainAmount(target, t, line);
    if (!verdict) continue;

    const sameAccount = t.account_id === accountId;
    const haystack = `${t.description} ${t.partner_name ?? ''}`;
    const overlap = tokenOverlap(line.memo, haystack);
    const similarity = textSimilarity(line.memo, haystack);
    const partnerHit = !!t.partner_name && tokenOverlap(line.memo, t.partner_name) > 0;

    // Pontuação: valor pesa mais, depois data, conta e texto.
    let score =
      verdict.quality * 55 +
      Math.max(0, 20 - dayGap * 3) +
      (sameAccount ? 12 : t.account_id ? 0 : 5) +
      Math.min(13, overlap * 5 + similarity * 8);
    if (partnerHit) score += 5;
    score = Math.round(Math.min(100, score));

    const reasons: string[] = [verdict.reason];
    reasons.push(dayGap === 0 ? 'mesma data' : `${dayGap} dia(s) de diferença`);
    if (sameAccount) reasons.push('mesma conta');
    else if (t.account_id) reasons.push('conta diferente no sistema');
    else reasons.push('lançamento sem conta');
    if (partnerHit) reasons.push(`parceiro "${t.partner_name}" citado no extrato`);
    else if (overlap > 0) reasons.push(`${overlap} palavra(s) em comum`);
    else if (similarity >= 0.45) reasons.push(`descrição parecida (${Math.round(similarity * 100)}%)`);

    let confidence: Confidence = 'baixa';
    if (score >= 82) confidence = 'alta';
    else if (score >= 62) confidence = 'media';

    // Texto totalmente divergente derruba a confiança, mesmo com valor exato.
    if (confidence === 'alta' && !sameAccount) confidence = 'media';

    out.push({ transaction: t, confidence, dayGap, amountGap: verdict.gap, basis: verdict.basis, score, reasons });
  }

  return out
    .sort((a, b) => b.score - a.score || a.amountGap - b.amountGap || a.dayGap - b.dayGap)
    .slice(0, 5);
}

/**
 * Seleciona as linhas que podem ser vinculadas em lote com segurança:
 * confiança alta, um único candidato e sem disputa pelo mesmo lançamento.
 */
export function pickAutoLinkable<T extends { key: string; suggestions: MatchSuggestion[] }>(
  items: T[]
): { key: string; transactionId: string; reasons: string[] }[] {
  const claimed = new Map<string, number>();
  const eligible = items.filter(i => {
    const top = i.suggestions[0];
    if (!top || top.confidence !== 'alta') return false;
    // Empate técnico com o segundo colocado: exige decisão manual.
    const second = i.suggestions[1];
    if (second && top.score - second.score < 8) return false;
    claimed.set(top.transaction.id, (claimed.get(top.transaction.id) ?? 0) + 1);
    return true;
  });

  return eligible
    .filter(i => claimed.get(i.suggestions[0].transaction.id) === 1)
    .map(i => ({
      key: i.key,
      transactionId: i.suggestions[0].transaction.id,
      reasons: i.suggestions[0].reasons,
    }));
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
