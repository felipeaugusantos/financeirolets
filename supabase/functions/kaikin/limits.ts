/**
 * Limites do Kaikin: cota por usuário e validação da entrada. Sem Deno nem rede, para ser testado com mocks.
 *
 *  - Cota: pedidos por minuto e por dia, contados no banco por `kaikin_consume` (migração 20261029120000).
 *  - Entrada: só papéis `user` e `assistant` vindos do cliente (o cliente não pode injetar `system` nem `tool`),
 *    no máximo MAX_MESSAGES mensagens, texto com tamanho limitado e corpo da requisição limitado.
 */

export const KAIKIN_LIMITS = {
  perMinute: 8,
  perDay: 150,
} as const;

export const INPUT_LIMITS = {
  /** Corpo da requisição (caracteres do JSON). O front envia no máximo 24 mensagens e o contexto da tela. */
  maxBodyChars: 120_000,
  maxMessages: 24,
  maxUserChars: 4_000,
  maxAssistantChars: 8_000,
  maxContextChars: 8_000,
} as const;

export interface QuotaResult {
  allowed: boolean;
  /** Segundos até a cota voltar (0 quando liberado). */
  retryAfter: number;
  limit: 'minute' | 'day' | null;
}

/** Interpreta o retorno de `kaikin_consume`. Qualquer formato inesperado é erro (a função bloqueia). */
export function parseQuota(data: unknown): QuotaResult {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (typeof d.allowed !== 'boolean') throw new Error('resposta inesperada de kaikin_consume');
  const retry = Number(d.retry_after);
  return {
    allowed: d.allowed,
    retryAfter: Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 0,
    limit: d.limit === 'minute' || d.limit === 'day' ? d.limit : null,
  };
}

export function quotaMessage(q: QuotaResult): string {
  return q.limit === 'day'
    ? 'Você atingiu o limite diário de perguntas ao Kaikin. Tente novamente amanhã.'
    : 'Muitas perguntas em pouco tempo. Aguarde alguns segundos e tente de novo.';
}

export interface SafeMessage { role: 'user' | 'assistant'; content: string }
export type InputResult =
  | { ok: true; messages: SafeMessage[]; pageContext: unknown }
  | { ok: false; status: 400 | 413; error: string };

const bad = (status: 400 | 413, error: string): InputResult => ({ ok: false, status, error });

/** Valida o corpo já lido como texto. Nada daqui chega à IA sem passar por esta função. */
export function parseChatInput(rawBody: string): InputResult {
  if (rawBody.length > INPUT_LIMITS.maxBodyChars) return bad(413, 'Pedido grande demais.');
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return bad(400, 'Pedido inválido.'); }
  const b = (typeof body === 'object' && body !== null ? body : {}) as { messages?: unknown; pageContext?: unknown };
  if (!Array.isArray(b.messages) || b.messages.length === 0) return bad(400, 'Envie ao menos uma mensagem.');

  const messages: SafeMessage[] = [];
  const window = b.messages.slice(-INPUT_LIMITS.maxMessages);
  for (let i = 0; i < window.length; i++) {
    const m = window[i];
    const isLast = i === window.length - 1;
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if (role !== 'user' && role !== 'assistant') return bad(400, 'Mensagem inválida.');
    if (typeof content !== 'string') return bad(400, 'Mensagem inválida.');
    // Só a pergunta atual é recusada; perguntas antigas longas são cortadas para não travar a conversa.
    if (isLast && role === 'user' && content.length > INPUT_LIMITS.maxUserChars) {
      return bad(413, `A pergunta passa de ${INPUT_LIMITS.maxUserChars} caracteres. Resuma e tente de novo.`);
    }
    // Respostas antigas do assistente só servem de contexto: o excesso é cortado, sem recusar a conversa.
    messages.push({ role, content: content.slice(0, role === 'assistant' ? INPUT_LIMITS.maxAssistantChars : INPUT_LIMITS.maxUserChars) });
  }
  if (messages[messages.length - 1].role !== 'user') return bad(400, 'A última mensagem deve ser do usuário.');

  let pageContext: unknown = null;
  if (b.pageContext != null) {
    const text = JSON.stringify(b.pageContext);
    // Contexto grande demais é descartado (a pergunta continua valendo).
    pageContext = text !== undefined && text.length <= INPUT_LIMITS.maxContextChars ? b.pageContext : null;
  }
  return { ok: true, messages, pageContext };
}
