import { describe, it, expect } from 'vitest';
import { autoTicketKey } from '@/lib/helpdesk';

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
