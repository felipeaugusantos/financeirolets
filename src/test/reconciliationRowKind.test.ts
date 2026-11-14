import { describe, it, expect } from 'vitest';
import { rowKind } from '@/components/ofx/ClassicReconciliation';

const mk = (o: any = {}) => ({
  entry: { status: 'pendente', match_note: null, ...o.entry },
  suggestions: o.suggestions ?? [],
  ruleLabel: o.ruleLabel ?? null,
}) as any;

describe('cores das linhas da conciliação', () => {
  it('transferência própria fica azul', () => {
    expect(rowKind(mk({ entry: { status: 'vinculado', match_note: 'Transferência interna entre contas próprias (fora do DRE)' } }))).toBe('transferencia');
  });
  it('sugestão exata fica verde mesmo com regra', () => {
    expect(rowKind(mk({ ruleLabel: 'CPFL', suggestions: [{ basis: 'exato', confidence: 'alta' }] }))).toBe('exata');
  });
  it('linha com regra fica turquesa', () => {
    expect(rowKind(mk({ ruleLabel: 'CPFL', suggestions: [{ basis: 'liquido', confidence: 'media' }] }))).toBe('regra');
  });
  it('sem sugestão nem regra fica amarela', () => {
    expect(rowKind(mk())).toBe('pendente');
  });
  it('linha já conciliada comum não recebe cor', () => {
    expect(rowKind(mk({ entry: { status: 'vinculado' } }))).toBeNull();
  });
});
