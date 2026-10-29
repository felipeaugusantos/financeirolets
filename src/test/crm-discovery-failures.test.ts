import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cnpjFailure, mapsFailure } from '../../supabase/functions/crm-discovery/rules';

// Corpo de erro "perigoso": se qualquer parte dele vazar para o cliente ou para o log, os testes quebram.
const SECRET = 'AIzaSyDUMMY-SECRET-KEY-123';
const rawBody = (reason?: string) => JSON.stringify({
  error: {
    code: 403, message: `Requests from referer <empty> are blocked. key=${SECRET}`, status: 'PERMISSION_DENIED',
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, metadata: { consumer: 'projects/123456789', apiKey: SECRET } }],
  },
  debug: 'Bearer eyJhbGciOi.token.value contato@cliente.com.br',
});
const leaks = (v: unknown) => /AIza|SECRET|Bearer|eyJ|contato@|projects\/123|PERMISSION_DENIED|referer/i.test(JSON.stringify(v));

describe('crm-discovery: falha do CNPJ (BrasilAPI)', () => {
  it.each([
    [404, 404, /CNPJ não encontrado/],
    [429, 429, /temporariamente limitada/],
    [400, 400, /CNPJ inválido/],
    [422, 400, /CNPJ inválido/],
    [503, 503, /indisponível/],
    [504, 503, /indisponível/],
    [500, 502, /indisponível/],
    [502, 502, /indisponível/],
    [401, 502, /indisponível/],
    [403, 502, /indisponível/],
  ])('provedor %i -> cliente recebe %i', (providerStatus, status, msg) => {
    const f = cnpjFailure(providerStatus);
    expect(f.status).toBe(status);
    expect(f.error).toMatch(msg);
    expect(f.log).toEqual({ provider: 'brasilapi', providerStatus });
  });
});

describe('crm-discovery: falha do Google Maps', () => {
  it('motivos conhecidos viram mensagem útil e podem ir ao log (lista fechada)', () => {
    const ref = mapsFailure(403, rawBody('API_KEY_HTTP_REFERRER_BLOCKED'));
    expect(ref.error).toMatch(/restringe sites/);
    expect(ref.log).toEqual({ provider: 'google_maps', providerStatus: 403, reason: 'API_KEY_HTTP_REFERRER_BLOCKED' });
    const svc = mapsFailure(403, rawBody('API_KEY_SERVICE_BLOCKED'));
    expect(svc.error).toMatch(/Places API/);
    expect(svc.log.reason).toBe('API_KEY_SERVICE_BLOCKED');
  });

  it('403 com motivo desconhecido ou corpo ilegível: mensagem genérica e nada do corpo no log', () => {
    for (const body of [rawBody('ALGO_NOVO_DO_GOOGLE'), rawBody(undefined), 'não é json', '', '{"error":null}']) {
      const f = mapsFailure(403, body);
      expect(f.error).toMatch(/negou a consulta/);
      expect(f.log).toEqual({ provider: 'google_maps', providerStatus: 403, reason: undefined });
    }
  });

  it.each([
    [429, 429, /temporariamente limitada/],
    [400, 400, /Não foi possível buscar/],
    [404, 404, /Não foi possível buscar/],
    [503, 503, /Não foi possível buscar/],
    [500, 502, /Não foi possível buscar/],
    [401, 502, /Não foi possível buscar/],
    [403, 502, /negou|restringe|Places/],
  ])('provedor %i -> cliente recebe %i', (providerStatus, status, msg) => {
    const f = mapsFailure(providerStatus, rawBody('API_KEY_SERVICE_BLOCKED'));
    expect(f.status).toBe(status);
    expect(f.error).toMatch(msg);
  });

  it('nunca repassa 401/403 do provedor (pareceria problema de login do usuário)', () => {
    for (const s of [401, 403]) {
      expect(mapsFailure(s, '').status).toBe(502);
      expect(cnpjFailure(s).status).toBe(502);
    }
  });

  it('nada do corpo bruto (chave, token, e-mail, projeto) aparece na resposta nem no log', () => {
    for (const reason of ['API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_SERVICE_BLOCKED', 'OUTRO', undefined]) {
      for (const status of [400, 401, 403, 404, 429, 500, 503]) {
        const f = mapsFailure(status, rawBody(reason));
        expect(leaks(f), `status ${status} / ${reason}`).toBe(false);
        expect(Object.keys(f)).toEqual(['status', 'error', 'log']);
        expect(Object.keys(f.log).sort()).toEqual(['provider', 'providerStatus', 'reason']);
      }
    }
  });
});

describe('crm-discovery: varredura do código', () => {
  const index = readFileSync('supabase/functions/crm-discovery/index.ts', 'utf8');
  it('nenhuma resposta ao cliente carrega details/status do provedor', () => {
    expect(index).not.toMatch(/\bdetails\b/);
    for (const line of index.split('\n').filter(l => /return json\(/.test(l))) {
      expect(line).not.toMatch(/\bstatus:\s*response|details|response\.text|await response/);
    }
  });
  it('os logs não recebem corpo de resposta, chaves nem cabeçalhos', () => {
    for (const line of index.split('\n').filter(l => /console\.(log|warn|error)/.test(l))) {
      expect(line).not.toMatch(/response\.|body|text\(|Authorization|Bearer|gatewayKey|connectionKey|KEY|token/i);
    }
  });
  it('o corpo do provedor só é lido para escolher a mensagem', () => {
    expect(index.match(/response\.text\(\)/g)).toHaveLength(1);
    expect(index).toMatch(/mapsFailure\(response\.status, await response\.text\(\)\)/);
  });
});
