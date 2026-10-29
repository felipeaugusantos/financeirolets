import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  KAIKIN_ALLOWED_ROLES, authorizeKaikin, handleKaikinRequest, isInvalidTokenError, corsHeaders, type KaikinDeps,
} from '../../supabase/functions/kaikin/access';

const USER = { id: 'u-1' };
const post = (headers: Record<string, string> = {}, method = 'POST') =>
  new Request('https://x.test/functions/v1/kaikin', { method, headers, body: method === 'POST' ? '{"messages":[]}' : undefined });
const bearer = (t = 'tok') => ({ Authorization: `Bearer ${t}` });

let verifyToken: ReturnType<typeof vi.fn>;
let fetchRoles: ReturnType<typeof vi.fn>;
let processFn: ReturnType<typeof vi.fn>;
let aiFetch: ReturnType<typeof vi.fn>;
let deps: KaikinDeps;
const realFetch = globalThis.fetch;

beforeEach(() => {
  verifyToken = vi.fn().mockResolvedValue(USER);
  fetchRoles = vi.fn().mockResolvedValue(['operador']);
  processFn = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
  // Nenhum teste pode chegar à IA ou à rede: qualquer fetch real quebra o teste.
  aiFetch = vi.fn().mockRejectedValue(new Error('rede/IA não deve ser usada nos testes'));
  globalThis.fetch = aiFetch as unknown as typeof fetch;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  deps = { verifyToken, fetchRoles, consumeQuota: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0, limit: null }), process: processFn };
});
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

/** Em toda negativa: nada de consulta de papéis (quando aplicável), nada de processamento, nada de IA. */
function expectBlocked(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(processFn).not.toHaveBeenCalled();
  expect(aiFetch).not.toHaveBeenCalled();
}

describe('kaikin: autenticação (401)', () => {
  it('anônimo: sem cabeçalho Authorization', async () => {
    const res = await handleKaikinRequest(post(), deps);
    expectBlocked(res, 401);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(fetchRoles).not.toHaveBeenCalled();
    expect((await res.json()).error).toMatch(/Entre no sistema/);
  });

  it.each(['', 'Bearer', 'Bearer ', 'Basic abc', 'Token abc', 'abc', 'Bearer a b'])('cabeçalho malformado (%j)', async (h) => {
    const res = await handleKaikinRequest(post({ Authorization: h }), deps);
    expectBlocked(res, 401);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('token inválido/expirado (Auth recusa)', async () => {
    verifyToken.mockResolvedValue(null);
    const res = await handleKaikinRequest(post(bearer('expirado')), deps);
    expectBlocked(res, 401);
    expect(verifyToken).toHaveBeenCalledWith('expirado');
    expect(fetchRoles).not.toHaveBeenCalled();
  });

  it('chave pública (anon) não é um usuário: o Auth devolve sem usuário e a chamada é negada', async () => {
    verifyToken.mockResolvedValue(null);
    const res = await handleKaikinRequest(post(bearer('eyJ.anon.key')), deps);
    expectBlocked(res, 401);
  });
});

describe('kaikin: autorização (403)', () => {
  it('usuário válido sem nenhum papel', async () => {
    fetchRoles.mockResolvedValue([]);
    const res = await handleKaikinRequest(post(bearer()), deps);
    expectBlocked(res, 403);
    expect((await res.json()).error).toMatch(/permissão/);
  });

  it('papel desconhecido não vale', async () => {
    fetchRoles.mockResolvedValue(['superusuario', 'ADMIN']);
    expectBlocked(await handleKaikinRequest(post(bearer()), deps), 403);
  });

  it('a consulta de papéis usa o token e o id do usuário verificado', async () => {
    await handleKaikinRequest(post(bearer('tk')), deps);
    expect(fetchRoles).toHaveBeenCalledWith('tk', USER.id);
  });
});

describe('kaikin: falha na verificação bloqueia (nunca libera por erro)', () => {
  it('Auth fora do ar', async () => {
    verifyToken.mockRejectedValue(new Error('timeout'));
    const res = await handleKaikinRequest(post(bearer()), deps);
    expectBlocked(res, 503);
    expect(fetchRoles).not.toHaveBeenCalled();
    expect((await res.json()).error).not.toMatch(/timeout/);
  });

  it('consulta de papéis falhou', async () => {
    fetchRoles.mockRejectedValue(new Error('permission denied'));
    const res = await handleKaikinRequest(post(bearer()), deps);
    expectBlocked(res, 503);
    expect((await res.json()).error).not.toMatch(/permission denied/);
  });
});

describe('kaikin: usuário autorizado', () => {
  it.each(KAIKIN_ALLOWED_ROLES)('papel %s é atendido e o processamento recebe o mesmo Authorization', async (role) => {
    fetchRoles.mockResolvedValue([role]);
    const res = await handleKaikinRequest(post(bearer('meu-token')), deps);
    expect(res.status).toBe(200);
    expect(processFn).toHaveBeenCalledTimes(1);
    expect(processFn.mock.calls[0][1]).toBe('Bearer meu-token');
    expect(await res.text()).toContain('[DONE]');
  });

  it('um papel válido entre outros desconhecidos basta', async () => {
    fetchRoles.mockResolvedValue(['xyz', 'financeiro']);
    expect((await handleKaikinRequest(post(bearer()), deps)).status).toBe(200);
  });

  it('aceita "bearer" em minúsculas', async () => {
    expect((await handleKaikinRequest(post({ Authorization: 'bearer tk' }), deps)).status).toBe(200);
  });
});

describe('kaikin: CORS e método', () => {
  it('preflight (OPTIONS) responde sem login e sem verificar nada', async () => {
    const res = await handleKaikinRequest(post({}, 'OPTIONS'), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(verifyToken).not.toHaveBeenCalled();
    expect(processFn).not.toHaveBeenCalled();
  });

  it('as negativas também levam os cabeçalhos CORS (o navegador precisa ler o 401/403)', async () => {
    const res = await handleKaikinRequest(post(), deps);
    for (const [k, v] of Object.entries(corsHeaders)) expect(res.headers.get(k)).toBe(v);
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('GET não é aceito', async () => {
    expectBlocked(await handleKaikinRequest(post(bearer(), 'GET'), deps), 405);
    expect(verifyToken).not.toHaveBeenCalled();
  });
});

describe('kaikin: classificação de erros do Auth', () => {
  it('erro 4xx do Auth é token inválido; rede/5xx/sem status é falha de verificação', () => {
    expect(isInvalidTokenError({ status: 401 })).toBe(true);
    expect(isInvalidTokenError({ status: 403 })).toBe(true);
    expect(isInvalidTokenError({ status: 400 })).toBe(true);
    expect(isInvalidTokenError({ status: 500 })).toBe(false);
    expect(isInvalidTokenError({ status: 0 })).toBe(false);
    expect(isInvalidTokenError(new Error('fetch failed'))).toBe(false);
    expect(isInvalidTokenError(null)).toBe(false);
  });
});

describe('kaikin: authorizeKaikin isolado', () => {
  it('devolve o usuário e só os papéis permitidos', async () => {
    fetchRoles.mockResolvedValue(['gerente_unidade', 'outro']);
    expect(await authorizeKaikin('Bearer t', deps)).toEqual({ ok: true, userId: USER.id, roles: ['gerente_unidade'] });
  });
});

describe('kaikin: varredura do código (guarda contra regressão)', () => {
  const index = readFileSync('supabase/functions/kaikin/index.ts', 'utf8');
  const access = readFileSync('supabase/functions/kaikin/access.ts', 'utf8');

  it('a entrada da função passa pela autorização e não existe outro Deno.serve', () => {
    expect(index.match(/Deno\.serve\(/g)).toHaveLength(1);
    expect(index).toMatch(/Deno\.serve\(\(req\) => handleKaikinRequest\(req, deps\)\)/);
  });
  it('não contorna o RLS: sem service_role e sem chave de serviço', () => {
    for (const src of [index, access]) expect(src).not.toMatch(/service_role|SERVICE_ROLE/i);
  });
  it('a chave da IA só é lida dentro do processamento (depois da autorização)', () => {
    const afterProcess = index.slice(index.indexOf('async function processChat'));
    const beforeProcess = index.slice(0, index.indexOf('async function processChat'));
    expect(afterProcess).toContain("Deno.env.get('LOVABLE_API_KEY')");
    expect(beforeProcess).not.toContain('LOVABLE_API_KEY');
    expect(access).not.toContain('LOVABLE_API_KEY');
  });
  it('o JWT continua exigido no gateway', () => {
    expect(readFileSync('supabase/config.toml', 'utf8')).toMatch(/\[functions\.kaikin\]\s+verify_jwt = true/);
  });
  it('os logs não recebem token nem cabeçalho Authorization', () => {
    for (const line of [...index.split('\n'), ...access.split('\n')].filter((l) => /console\.(log|warn|error)/.test(l))) {
      expect(line).not.toMatch(/authHeader|Authorization|token/i);
    }
  });
});
