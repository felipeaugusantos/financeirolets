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
  front_id?: string | null;
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

/** Converte entidades HTML/SGML que o banco manda no memo (&amp;, &quot;...). */
export function decodeEntities(s: string): string {
  return (s || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Normaliza texto para comparação: sem entidade, sem acento, sem pontuação, minúsculo. */
export function normalizeText(s: string): string {
  return decodeEntities(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Texto normalizado sem a data que o banco cola no fim do histórico
 * ("... 04/09", "... 05/09/2026"). Autorizado pelo cliente.
 */
export function stripDateSuffix(s: string): string {
  const semData = decodeEntities(s || '')
    .replace(/(\s+\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?)+\s*$/g, '');
  return normalizeText(semData);
}

/**
 * Assinatura do "tipo de histórico": remove números, datas e códigos para
 * agrupar linhas que se repetem toda semana (tarifas, Stone, antecipações).
 */
export function memoPattern(memo: string): string {
  return normalizeText(memo)
    .replace(/\b\d+\b/g, ' ')
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

/** Uma linha de rateio guardada na própria regra (sempre em percentual). */
export interface RuleAllocation {
  unit_id: string | null;
  front_id: string | null;
  percentage: number;
}

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
  /** Só vale para o extrato desta conta (null = qualquer conta). */
  account_id?: string | null;
  /** Textos que anulam a regra, separados por vírgula. */
  exclude_pattern?: string | null;
  /** Faixa de valor (em módulo) em que a regra vale. */
  min_amount?: number | null;
  max_amount?: number | null;
  /** Usa a unidade padrão da conta do extrato em vez de uma unidade fixa. */
  use_statement_unit?: boolean | null;
  /** Rateio percentual por unidade/frente. */
  allocations?: RuleAllocation[] | null;
}

/** Contexto do extrato usado pelas regras (conta e unidade padrão da conta). */
export interface RuleContext {
  accountId?: string | null;
  accountUnitId?: string | null;
}

export interface RuleOutcome {
  rule: OfxRule;
  category_id: string | null;
  unit_id: string | null;
  front_id: string | null;
  partner_id: string | null;
  allocations: RuleAllocation[] | null;
}

/** Lê o rateio da regra, tolerando dado antigo/ inválido no banco. */
export function ruleAllocations(rule: OfxRule): RuleAllocation[] | null {
  const raw = rule.allocations;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const list = raw
    .map(a => ({
      unit_id: a?.unit_id ?? null,
      front_id: a?.front_id ?? null,
      percentage: Number(a?.percentage ?? 0),
    }))
    .filter(a => a.percentage > 0 && (a.unit_id || a.front_id));
  return list.length ? list : null;
}

/** Diz se uma regra casa com a linha, considerando conta, exceção e faixa de valor. */
export function ruleMatches(
  rule: OfxRule,
  memo: string,
  amount: number,
  ctx: RuleContext = {},
): boolean {
  const type: 'receita' | 'despesa' = amount >= 0 ? 'receita' : 'despesa';
  if (!rule.active) return false;
  if (rule.applies_to !== 'ambos' && rule.applies_to !== type) return false;

  // 5) regra restrita a uma conta do extrato
  if (rule.account_id && ctx.accountId && rule.account_id !== ctx.accountId) return false;

  // 4) faixa de valor (sempre em módulo)
  const abs = Math.abs(amount);
  if (rule.min_amount != null && abs < Number(rule.min_amount)) return false;
  if (rule.max_amount != null && abs > Number(rule.max_amount)) return false;

  const haystack = normalizeText(memo);

  // 3) exceções: qualquer termo presente anula a regra
  const excludes = (rule.exclude_pattern ?? '')
    .split(',')
    .map(s => normalizeText(s.trim()))
    .filter(Boolean);
  if (excludes.some(e => haystack.includes(e))) return false;

  if (rule.match_type === 'regex') {
    try { return new RegExp(rule.pattern, 'i').test(memo); } catch { return false; }
  }
  return haystack.includes(normalizeText(rule.pattern));
}

/** Todas as regras que casam com a linha, na ordem de prioridade. */
export function matchingRules(
  memo: string, amount: number, rules: OfxRule[], ctx: RuleContext = {},
): OfxRule[] {
  return [...rules]
    .sort((a, b) => a.priority - b.priority)
    .filter(r => ruleMatches(r, memo, amount, ctx));
}

/** Aplica a primeira regra ativa que casar com o memo (menor prioridade primeiro). */
export function applyRules(
  memo: string, amount: number, rules: OfxRule[], ctx: RuleContext = {},
): RuleOutcome | null {
  const rule = matchingRules(memo, amount, rules, ctx)[0];
  if (!rule) return null;
  return {
    rule,
    category_id: rule.category_id,
    // 1) unidade vinda da conta do extrato
    unit_id: rule.use_statement_unit ? (ctx.accountUnitId ?? null) : rule.unit_id,
    front_id: rule.front_id,
    partner_id: rule.partner_id,
    // 2) rateio definido na própria regra
    allocations: ruleAllocations(rule),
  };
}


// ---------------------------------------------------------------------------
// Vínculo automático por descrição idêntica (não concilia, apenas vincula)
// ---------------------------------------------------------------------------

export interface DescriptionMatch {
  /** Lançamentos com a MESMA descrição do memo do extrato. */
  transactions: CandidateTransaction[];
  /** Lançamentos com descrição + data + valor iguais (pode haver duplicados legítimos). */
  exactTransactions: CandidateTransaction[];
  /** Único candidato encontrado (quando há exatamente um com data+valor+descrição iguais). */
  transaction: CandidateTransaction | null;
  /** Campos em que a regra de conciliação diverge do lançamento existente. */
  divergences: string[];
  /** Mais de um lançamento equivalente — exige decisão manual. */
  ambiguous: boolean;
  /** Pronto para vínculo automático: data + descrição + valor iguais, único candidato e sem divergências. */
  autoLinkable: boolean;
  /** Bate parcialmente (ex.: mesma descrição e valor, data diferente) — precisa de análise do usuário. */
  similar: boolean;
  /** O que difere nos candidatos apenas similares (ex.: "data", "valor"). */
  similarReasons: string[];
}

const FIELD_LABEL: Record<string, string> = {
  category_id: 'categoria',
  unit_id: 'unidade',
  front_id: 'frente',
  partner_id: 'parceiro',
};

const EMPTY_DESC_MATCH: DescriptionMatch = {
  transactions: [], exactTransactions: [], transaction: null, divergences: [], ambiguous: false,
  autoLinkable: false, similar: false, similarReasons: [],
};

export function emptyDescriptionMatch(): DescriptionMatch {
  return { ...EMPTY_DESC_MATCH };
}

/** Campos em que a regra sugerida diverge do lançamento existente. */
export function ruleDivergences(
  transaction: CandidateTransaction,
  outcome: RuleOutcome | null
): string[] {
  if (!outcome) return [];
  const compare: [keyof RuleOutcome & string, string | null | undefined][] = [
    ['category_id', transaction.category_id],
    ['unit_id', transaction.unit_id],
    ['front_id', transaction.front_id],
    ['partner_id', transaction.partner_id],
  ];
  const out: string[] = [];
  for (const [field, current] of compare) {
    const expected = (outcome as any)[field] as string | null;
    if (expected && (current ?? null) !== expected) out.push(FIELD_LABEL[field]);
  }
  return out;
}

/** Datas possíveis do lançamento que podem corresponder à data do extrato. */
function transactionDates(t: CandidateTransaction): string[] {
  return [t.payment_date, t.due_date, t.competence_date].filter(Boolean) as string[];
}

/** O valor do extrato bate com o bruto ou o líquido do lançamento? */
function sameAmount(entryAmount: number, t: CandidateTransaction): boolean {
  const target = Math.abs(entryAmount);
  const bases = [t.amount, t.net_amount].filter(v => v != null) as number[];
  return bases.some(b => Math.abs(Math.abs(b) - target) <= 0.01);
}

/**
 * Procura lançamentos com a MESMA descrição (normalizada) do memo do extrato.
 *
 * Vínculo automático só acontece quando DATA, DESCRIÇÃO e VALOR são iguais,
 * existe um único candidato e a regra de conciliação não diverge do lançamento.
 * Quando só parte das informações bate (ex.: valor e descrição, data diferente),
 * o resultado é marcado como *similar* — nunca vinculado sozinho.
 */
export function matchByDescription(
  memo: string,
  amount: number,
  postedAt: string,
  candidates: CandidateTransaction[],
  outcome: RuleOutcome | null
): DescriptionMatch {
  const key = stripDateSuffix(memo || '');
  if (!key) return emptyDescriptionMatch();

  const type: 'receita' | 'despesa' = amount >= 0 ? 'receita' : 'despesa';
  const hits = candidates.filter(
    t => t.type === type && stripDateSuffix(t.description || '') === key
  );
  if (hits.length === 0) return emptyDescriptionMatch();

  const exact = hits.filter(
    t => sameAmount(amount, t) && (postedAt ? transactionDates(t).includes(postedAt) : false)
  );

  const transaction = exact.length === 1 ? exact[0] : null;

  const divergences = transaction ? ruleDivergences(transaction, outcome) : [];

  const autoLinkable = Boolean(transaction) && divergences.length === 0;

  // Similaridade: existe candidato com a mesma descrição que não fechou tudo.
  const similarReasons: string[] = [];
  if (!autoLinkable) {
    const partial = exact.length > 0 ? exact : hits;
    const anyAmount = partial.some(t => sameAmount(amount, t));
    const anyDate = postedAt ? partial.some(t => transactionDates(t).includes(postedAt)) : false;
    if (!anyDate) similarReasons.push('data');
    if (!anyAmount) similarReasons.push('valor');
    if (exact.length > 1) similarReasons.push('mais de um lançamento equivalente');
    if (similarReasons.length === 0 && divergences.length > 0) {
      similarReasons.push(`diverge da regra: ${divergences.join(', ')}`);
    }
  }

  return {
    transactions: hits,
    exactTransactions: exact,
    transaction,
    divergences,
    ambiguous: exact.length > 1 || (exact.length === 0 && hits.length > 1),
    autoLinkable,
    similar: !autoLinkable && similarReasons.length > 0,
    similarReasons,
  };
}


// ---------------------------------------------------------------------------
// Pareamento 1:1 de linhas duplicadas do extrato
// ---------------------------------------------------------------------------

/** Como cada linha duplicada terminou no rateio 1:1. */
export type PairOutcome = 'pareado' | 'unico' | 'sem-lancamento' | 'divergente';

export interface DuplicatePairLine {
  key: string;
  outcome: PairOutcome;
  transactionId: string | null;
  transactionDescription: string | null;
  /** Divergências da regra de conciliação no lançamento reservado. */
  divergences: string[];
  note: string;
}

export interface DuplicatePairGroup {
  /** Assinatura da duplicidade: descrição normalizada + data + valor. */
  signature: string;
  memo: string;
  posted_at: string;
  amount: number;
  /** Quantas linhas do extrato compartilham a assinatura. */
  entryCount: number;
  /** Quantos lançamentos equivalentes existem para dividir entre elas. */
  candidateCount: number;
  lines: DuplicatePairLine[];
}

export interface PairableItem {
  key: string;
  memo: string;
  posted_at: string;
  amount: number;
  descMatch: DescriptionMatch;
  outcome: RuleOutcome | null;
}

export interface PairDuplicatesResult {
  /** Novo DescriptionMatch por linha que recebeu um lançamento reservado. */
  patches: Map<string, DescriptionMatch>;
  /** Relatório de conferência dos grupos com linhas idênticas. */
  groups: DuplicatePairGroup[];
}

export function duplicateSignature(memo: string, postedAt: string, amount: number): string {
  return `${normalizeText(memo || '')}|${postedAt}|${Math.abs(amount).toFixed(2)}`;
}

/**
 * Divide lançamentos idênticos entre linhas idênticas do extrato, uma para cada.
 *
 * A ordem de entrada define a prioridade — a primeira linha reserva o primeiro
 * lançamento livre. Lançamentos já vinculados a outra linha entram em `reserved`
 * e nunca são reaproveitados.
 */
export function pairDuplicates(
  items: PairableItem[],
  reserved: Iterable<string> = []
): PairDuplicatesResult {
  const taken = new Set<string>(reserved);
  const patches = new Map<string, DescriptionMatch>();

  const groups = new Map<string, DuplicatePairGroup>();
  const bySignature = new Map<string, PairableItem[]>();
  for (const item of items) {
    const sig = duplicateSignature(item.memo, item.posted_at, item.amount);
    const arr = bySignature.get(sig) ?? [];
    arr.push(item);
    bySignature.set(sig, arr);
  }

  for (const item of items) {
    const m = item.descMatch;
    if (m.transaction) { taken.add(m.transaction.id); continue; }
    if (m.exactTransactions.length < 2) continue;

    const free = m.exactTransactions.find(t => !taken.has(t.id));
    if (!free) continue;
    taken.add(free.id);

    const divergences = ruleDivergences(free, item.outcome);
    patches.set(item.key, {
      ...m,
      transaction: free,
      divergences,
      ambiguous: false,
      autoLinkable: divergences.length === 0,
      similar: divergences.length > 0,
      similarReasons: divergences.length > 0 ? [`diverge da regra: ${divergences.join(', ')}`] : [],
    });
  }

  for (const [sig, list] of bySignature) {
    const candidateCount = Math.max(...list.map(i => i.descMatch.exactTransactions.length), 0);
    const isDuplicateGroup = list.length > 1 || candidateCount > 1;
    if (!isDuplicateGroup) continue;

    const first = list[0];
    groups.set(sig, {
      signature: sig,
      memo: first.memo,
      posted_at: first.posted_at,
      amount: first.amount,
      entryCount: list.length,
      candidateCount,
      lines: list.map(item => {
        const m = patches.get(item.key) ?? item.descMatch;
        const tx = m.transaction;
        let outcome: PairOutcome;
        let note: string;
        if (!tx) {
          outcome = 'sem-lancamento';
          note = 'Nenhum lançamento equivalente sobrou para esta linha.';
        } else if (m.divergences.length > 0) {
          outcome = 'divergente';
          note = `Reservou "${tx.description}", mas a regra diverge em ${m.divergences.join(', ')}.`;
        } else if (patches.has(item.key)) {
          outcome = 'pareado';
          note = `Reservou o lançamento "${tx.description}" no rateio 1:1.`;
        } else {
          outcome = 'unico';
          note = `Candidato único: "${tx.description}".`;
        }
        return {
          key: item.key,
          outcome,
          transactionId: tx?.id ?? null,
          transactionDescription: tx?.description ?? null,
          divergences: m.divergences,
          note,
        };
      }),
    });
  }

  return { patches, groups: [...groups.values()] };
}
