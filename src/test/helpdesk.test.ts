import { describe, it, expect } from 'vitest';
import { autoTicketKey, buildHelpdeskReply, validateHelpdeskImages } from '@/lib/helpdesk';

describe('imagens do chamado', () => {
  const img = { type: 'image/png', size: 1000 };
  it('aceita até 3 imagens', () => expect(validateHelpdeskImages([img, img, img])).toBeNull());
  it('recusa a 4ª imagem', () => expect(validateHelpdeskImages([img, img, img, img])).not.toBeNull());
  it('recusa imagem acima de 5 MB', () => expect(validateHelpdeskImages([{ type: 'image/png', size: 5 * 1024 * 1024 + 1 }])).not.toBeNull());
  it('recusa arquivo que não é imagem', () => expect(validateHelpdeskImages([{ type: 'application/pdf', size: 10 }])).not.toBeNull());
});

describe('imagens nas respostas', () => {
  it('inclui os links sem perder a mensagem', () => {
    const reply = buildHelpdeskReply('Segue a imagem', ['https://example.com/imagem?token=teste']);
    expect(reply).toContain('Segue a imagem');
    expect(reply).toContain('https://example.com/imagem?token=teste');
  });
  it('preserva uma resposta sem imagens', () => expect(buildHelpdeskReply('  Resolvido  ', [])).toBe('Resolvido'));
  it('recusa resposta vazia mesmo com imagem', () => expect(() => buildHelpdeskReply(' ', ['https://example.com/imagem'])).toThrow());
  it('recusa mensagem com anexos acima do limite da central', () => expect(() => buildHelpdeskReply('x'.repeat(15000), ['https://example.com/imagem'])).toThrow());
});

describe('chamados automáticos', () => {
  it('mesmo erro no mesmo dia gera a mesma chave (1 chamado por dia)', () => {
    const d = new Date('2026-11-04T10:00:00Z');
    expect(autoTicketKey('Falha OFX', 'x', d)).toBe(autoTicketKey('Falha OFX', 'x', new Date('2026-11-04T20:00:00Z')));
  });
  it('outro dia ou outro erro abre novo chamado', () => {
    const d = new Date('2026-11-04T10:00:00Z');
    expect(autoTicketKey('Falha OFX', 'x', d)).not.toBe(autoTicketKey('Falha OFX', 'x', new Date('2026-11-05T10:00:00Z')));
    expect(autoTicketKey('Falha OFX', 'x', d)).not.toBe(autoTicketKey('Falha OFX', 'y', d));
  });
});
