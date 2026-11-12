/**
 * CORS das funções do sistema. O CORS não substitui a autenticação (todas as funções exigem JWT);
 * ele só impede que páginas de outros sites usem a sessão do navegador do usuário para chamá-las.
 *
 * Origens aceitas:
 *  - o site publicado e seus previews do Lovable (https://*.lovable.app, https://*.lovableproject.com);
 *  - desenvolvimento local (http://localhost:* e http://127.0.0.1:*);
 *  - origens extras da variável de ambiente ALLOWED_ORIGINS (separadas por vírgula; use para domínio próprio).
 * Sem Origin (chamadas de servidor, curl) não há CORS a aplicar. Origem não aceita: nenhum cabeçalho
 * Access-Control-Allow-Origin, e o navegador bloqueia a resposta.
 */

const ALLOWED_PATTERNS: RegExp[] = [
  /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.lovable\.app$/i,
  /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.lovableproject\.com$/i,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/i,
];

const ALLOW_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version';

function envOrigins(): string {
  const deno = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.('ALLOWED_ORIGINS') ?? '';
}

export function isAllowedOrigin(origin: string | null, extra: string = envOrigins()): boolean {
  if (!origin) return false;
  if (ALLOWED_PATTERNS.some((re) => re.test(origin))) return true;
  return extra.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean).includes(origin);
}

/** Cabeçalhos CORS para esta requisição. `methods` lista os métodos da função (padrão: POST). */
export function corsFor(req: Request, methods = 'POST, OPTIONS', extra?: string): Record<string, string> {
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (isAllowedOrigin(origin, extra)) headers['Access-Control-Allow-Origin'] = origin as string;
  return headers;
}
