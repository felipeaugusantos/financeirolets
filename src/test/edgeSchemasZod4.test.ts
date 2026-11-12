import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ticketSchema, replySchema } from '../../supabase/functions/helpdesk-ticket/schemas';
import { discoverySchema } from '../../supabase/functions/crm-discovery/rules';

const ticket = { assunto: 'Erro na tela', descricao: 'Algo falhou', prioridade: 'alta', tela: '/lancamentos', origem: 'manual' };

describe('zod 4: schemas das edge functions', () => {
  it('a versão instalada é a 4 e as funções fixam a mesma', () => {
    expect(z.string().safeParse(1).success).toBe(false);
    expect(JSON.parse(readFileSync('package.json', 'utf8')).dependencies.zod).toMatch(/^\^4\./);
    for (const f of ['helpdesk-ticket', 'crm-discovery']) {
      expect(JSON.parse(readFileSync(`supabase/functions/${f}/deno.json`, 'utf8')).imports.zod).toMatch(/^npm:zod@4\./);
    }
    expect(readFileSync('supabase/functions/helpdesk-ticket/index.ts', 'utf8')).not.toMatch(/npm:zod@3/);
  });

  it('chamado: aceita o formato válido e apara espaços', () => {
    expect(ticketSchema.parse({ ...ticket, assunto: '  Erro na tela  ' }).assunto).toBe('Erro na tela');
  });

  it.each([
    ['assunto curto', { assunto: 'ab' }],
    ['assunto longo', { assunto: 'a'.repeat(201) }],
    ['descrição gigante', { descricao: 'a'.repeat(15001) }],
    ['prioridade desconhecida', { prioridade: 'urgente' }],
    ['origem desconhecida', { origem: 'robo' }],
    ['campo extra (strict)', { extra: 1 }],
  ])('chamado: recusa %s', (_n, over) => {
    expect(ticketSchema.safeParse({ ...ticket, ...over }).success).toBe(false);
  });

  it('chamado: recusa campo ausente', () => {
    const { tela: _t, ...rest } = ticket;
    expect(ticketSchema.safeParse(rest).success).toBe(false);
  });

  it('resposta: número vira texto (string ou number) e mensagem é aparada', () => {
    expect(replySchema.parse({ acao: 'responder', numero: 123, mensagem: ' oi ' })).toEqual({ acao: 'responder', numero: '123', mensagem: 'oi' });
    expect(replySchema.parse({ acao: 'responder', numero: 'CH-9', mensagem: 'ok' }).numero).toBe('CH-9');
  });

  it.each([
    ['mensagem curta', { mensagem: 'a' }],
    ['número vazio', { numero: '' }],
    ['número longo', { numero: 'x'.repeat(41) }],
    ['ação errada', { acao: 'listar' }],
    ['campo extra', { extra: true }],
  ])('resposta: recusa %s', (_n, over) => {
    expect(replySchema.safeParse({ acao: 'responder', numero: '1', mensagem: 'oi', ...over }).success).toBe(false);
  });

  it('busca de empresas: aceita ids de unidade fora do padrão RFC (guid) e devolve mensagens de erro', () => {
    const odd = '00000000-0000-0000-0000-000000000001';
    expect(discoverySchema.safeParse({ mode: 'location', unitId: odd, segment: 'Clínicas', location: 'São Paulo' }).success).toBe(true);
    const bad = discoverySchema.safeParse({ mode: 'cnpj', unitId: odd, cnpj: '123' });
    expect(bad.success).toBe(false);
    expect(!bad.success && bad.error.issues.map(i => i.message)).toContain('Informe um CNPJ com 14 dígitos');
  });
});
