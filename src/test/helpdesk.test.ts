import { describe, it, expect } from 'vitest';
import { autoTicketKey, validateHelpdeskImages } from '@/lib/helpdesk';

describe('imagens do chamado', () => {
  const img = { type: 'image/png', size: 1000 };
  it('aceita até 3 imagens', () => expect(validateHelpdeskImages([img, img, img])).toBeNull());
  it('recusa a 4ª imagem', () => expect(validateHelpdeskImages([img, img, img, img])).not.toBeNull());
  it('recusa imagem acima de 5 MB', () => expect(validateHelpdeskImages([{ type: 'image/png', size: 5 * 1024 * 1024 + 1 }])).not.toBeNull());
  it('recusa arquivo que não é imagem', () => expect(validateHelpdeskImages([{ type: 'application/pdf', size: 10 }])).not.toBeNull());
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
