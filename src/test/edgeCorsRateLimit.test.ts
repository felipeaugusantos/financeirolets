import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { corsFor, isAllowedOrigin } from '../../supabase/functions/_shared/cors';
import { createRateLimiter, tooManyRequests } from '../../supabase/functions/_shared/rate-limit';

const req = (origin?: string) => new Request('https://x.test/f', { method: 'POST', headers: origin ? { Origin: origin } : {} });

describe('CORS das funções', () => {
  it.each([
    'https://financeirolets.lovable.app',
    'https://id-preview--abc.lovable.app',
    'https://abc.lovableproject.com',
    'http://localhost:8080',
    'http://127.0.0.1:5173',
  ])('aceita %s', (o) => {
    expect(isAllowedOrigin(o, '')).toBe(true);
    expect(corsFor(req(o), 'POST, OPTIONS', '')['Access-Control-Allow-Origin']).toBe(o);
  });

  it.each([
    'https://evil.com',
    'https://financeirolets.lovable.app.evil.com',
    'https://lovable.app.evil.com',
    'http://financeirolets.lovable.app',
    'http://localhost.evil.com',
    'null',
  ])('recusa %s (sem Access-Control-Allow-Origin)', (o) => {
    expect(isAllowedOrigin(o, '')).toBe(false);
    expect(corsFor(req(o), 'POST, OPTIONS', '')['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('sem Origin não há cabeçalho de origem; Vary e métodos sempre presentes', () => {
    const h = corsFor(req(), 'POST, OPTIONS', '');
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
    expect(h.Vary).toBe('Origin');
    expect(h['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(h['Access-Control-Allow-Headers']).toContain('authorization');
  });

  it('aceita origens extras de ALLOWED_ORIGINS (domínio próprio)', () => {
    expect(isAllowedOrigin('https://app.empresa.com.br', 'https://app.empresa.com.br/, https://b.com')).toBe(true);
    expect(isAllowedOrigin('https://outro.com', 'https://app.empresa.com.br')).toBe(false);
  });

  it('nenhuma função usa mais Access-Control-Allow-Origin: *', () => {
    for (const f of ['kaikin/access.ts', 'kaikin/index.ts', 'helpdesk-ticket/index.ts', 'crm-discovery/index.ts']) {
      const src = readFileSync(`supabase/functions/${f}`, 'utf8');
      expect(src).not.toMatch(/Allow-Origin'?:\s*'\*'/);
      expect(src).not.toContain('supabase-js@2/cors');
    }
  });
});

describe('limitador de pedidos', () => {
  it('bloqueia acima do máximo na janela e informa Retry-After', () => {
    const rl = createRateLimiter({ max: 3, windowMs: 60_000 });
    expect([1, 2, 3].map(() => rl.check('u', 1000).allowed)).toEqual([true, true, true]);
    const blocked = rl.check('u', 11_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(50);
  });

  it('libera na janela seguinte e separa usuários', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.check('a', 0).allowed).toBe(true);
    expect(rl.check('a', 500).allowed).toBe(false);
    expect(rl.check('b', 500).allowed).toBe(true);
    expect(rl.check('a', 1000).allowed).toBe(true);
  });

  it('não cresce sem limite de chaves', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000, maxKeys: 10 });
    for (let i = 0; i < 100; i++) expect(rl.check(`k${i}`, 0).allowed).toBe(true);
  });

  it('resposta 429 leva CORS, JSON e Retry-After', async () => {
    const res = tooManyRequests(7, { 'Access-Control-Allow-Origin': 'https://x' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://x');
    expect((await res.json()).error).toMatch(/Aguarde/);
  });

  it('crm-discovery e helpdesk-ticket aplicam o limitador depois da autenticação', () => {
    const crm = readFileSync('supabase/functions/crm-discovery/index.ts', 'utf8');
    expect(crm.indexOf('limiter.check')).toBeGreaterThan(crm.indexOf('auth.getUser'));
    const hd = readFileSync('supabase/functions/helpdesk-ticket/index.ts', 'utf8');
    expect(hd.indexOf('.check(userData.user.id)')).toBeGreaterThan(hd.indexOf('auth.getUser'));
  });
});
