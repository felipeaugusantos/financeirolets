/**
 * Controle de acesso da função kaikin (assistente de IA).
 *
 * Esta camada roda ANTES de qualquer consulta ao banco ou chamada à IA e não depende de Deno nem de rede:
 * as verificações entram por injeção, para serem testadas com mocks.
 *
 * Regras (documentadas em docs/kaikin-acesso.md):
 *  - Sem token, token malformado, expirado ou que não seja de um usuário (ex.: a chave pública/anon): 401.
 *  - Usuário válido sem nenhum papel em user_roles: 403. É o critério já usado no sistema para "usuário
 *    provisionado" (ex.: política de leitura da Fábrica) e o administrador remove os papéis para desativar alguém.
 *  - Falha ao verificar (Auth ou consulta de papéis fora do ar): bloqueia com 503. Nunca libera por erro.
 *  - Usuário autorizado que passou da cota (por minuto/dia): 429 com Retry-After. A cota é conferida depois do acesso e
 *    antes de qualquer consulta ou chamada à IA; falha na conferência também bloqueia (503).
 *  - As consultas das ferramentas continuam sendo feitas com o token do usuário (o RLS vale; nada é contornado).
 */

import { quotaMessage, type QuotaResult } from './limits.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Papéis existentes no sistema (enum app_role) que podem usar o assistente. Qualquer um deles basta. */
export const KAIKIN_ALLOWED_ROLES = ['admin', 'financeiro', 'gerente_unidade', 'operador', 'vendedor'] as const;

export type AccessDecision =
  | { ok: true; userId: string; roles: string[] }
  | { ok: false; status: 401 | 403 | 503; error: string };

export interface AccessDeps {
  /** Valida o token no Supabase Auth. null = token inválido/expirado/de outro tipo. Lança em falha da verificação. */
  verifyToken(token: string): Promise<{ id: string } | null>;
  /** Papéis do usuário (consulta feita com o token dele). Lança em falha. */
  fetchRoles(token: string, userId: string): Promise<string[]>;
}

export interface KaikinDeps extends AccessDeps {
  /** Consome 1 pedido da cota do usuário (consulta feita com o token dele). Lança em falha. */
  consumeQuota(token: string): Promise<QuotaResult>;
  /** Processamento do assistente (consultas e IA). Só é chamado depois da autorização. */
  process(req: Request, authHeader: string): Promise<Response>;
}

/**
 * O Supabase Auth recusa o token com erro de cliente (4xx). Qualquer outro erro (rede, 5xx) é falha da
 * verificação, e não motivo para dizer ao usuário que a sessão expirou.
 */
export function isInvalidTokenError(err: unknown): boolean {
  const status = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : undefined;
  return typeof status === 'number' && status >= 400 && status < 500;
}

const DENY = {
  noSession: { ok: false, status: 401, error: 'Entre no sistema para usar o assistente.' },
  invalidSession: { ok: false, status: 401, error: 'Sessão inválida ou expirada. Entre novamente.' },
  forbidden: { ok: false, status: 403, error: 'Seu usuário não tem permissão para usar o assistente.' },
  unavailable: { ok: false, status: 503, error: 'Não foi possível verificar seu acesso agora. Tente novamente.' },
} as const satisfies Record<string, AccessDecision>;

function bearerToken(authHeader: string | null): string | null {
  const m = authHeader?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

export async function authorizeKaikin(authHeader: string | null, deps: AccessDeps): Promise<AccessDecision> {
  const token = bearerToken(authHeader);
  if (!token) return DENY.noSession;

  let user: { id: string } | null;
  try {
    user = await deps.verifyToken(token);
  } catch {
    return DENY.unavailable;
  }
  if (!user?.id) return DENY.invalidSession;

  let roles: string[];
  try {
    roles = await deps.fetchRoles(token, user.id);
  } catch {
    return DENY.unavailable;
  }
  const allowed = roles.filter((r) => (KAIKIN_ALLOWED_ROLES as readonly string[]).includes(r));
  if (allowed.length === 0) return DENY.forbidden;
  return { ok: true, userId: user.id, roles: allowed };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/**
 * Porta de entrada da função: preflight (CORS) → método → autorização → processamento.
 * O preflight não exige login (o navegador não envia credenciais nele).
 */
export async function handleKaikinRequest(req: Request, deps: KaikinDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const authHeader = req.headers.get('Authorization');
  const decision = await authorizeKaikin(authHeader, deps);
  // 'error' in decision estreita a união também com o tsconfig do app (sem strictNullChecks).
  if ('error' in decision) {
    console.warn('[kaikin] acesso negado', decision.status);
    return json({ error: decision.error }, decision.status);
  }

  // Cota por usuário. Se não der para conferir, bloqueia (nunca libera por erro), como no acesso.
  let quota: QuotaResult;
  try {
    quota = await deps.consumeQuota((authHeader as string).replace(/^Bearer\s+/i, ''));
  } catch (e) {
    console.error('[kaikin] falha ao conferir a cota', e instanceof Error ? e.message : 'erro');
    return json({ error: DENY.unavailable.error }, DENY.unavailable.status);
  }
  if (!quota.allowed) {
    console.warn('[kaikin] cota excedida', quota.limit);
    return new Response(JSON.stringify({ error: quotaMessage(quota) }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(Math.max(1, quota.retryAfter)) },
    });
  }
  return deps.process(req, authHeader as string);
}
