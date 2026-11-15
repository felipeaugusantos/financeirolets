import { describe, it, expect } from 'vitest';
import { proposalTotals, proposalValidUntil } from '@/lib/proposalPdf';

describe('proposta comercial', () => {
  it('soma os itens e aplica o desconto em %', () => {
    expect(proposalTotals([{ name: 'Caixa 6', packages: 10, unitPrice: 45 }, { name: 'Kit', packages: 2, unitPrice: 99.9 }], 10))
      .toEqual({ subtotal: 649.8, discount: 64.98, total: 584.82 });
  });
  it('desconto fora de 0–100 é limitado', () => {
    expect(proposalTotals([{ name: 'A', packages: 1, unitPrice: 50 }], 150).total).toBe(0);
    expect(proposalTotals([{ name: 'A', packages: 1, unitPrice: 50 }], -5).total).toBe(50);
  });
  it('validade conta dias a partir da emissão', () => {
    expect(proposalValidUntil('2026-10-27', 7)).toBe('2026-11-03');
  });
});

import { perPersonLine } from '@/lib/proposalMath';
describe('proposta por pessoa', () => {
  it('total = pessoas × preço por pessoa, com desconto', () => {
    expect(proposalTotals([perPersonLine('Coffee break', 30, 25.5)], 10)).toEqual({ subtotal: 765, discount: 76.5, total: 688.5 });
  });
  it('pessoas fracionadas ou negativas não contam', () => {
    expect(perPersonLine('', 12.7, 10).packages).toBe(12);
    expect(perPersonLine('', -3, 10).packages).toBe(0);
  });
});
