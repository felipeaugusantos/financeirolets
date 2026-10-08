import { describe, it, expect } from 'vitest';
import { parseView, serializeView, variationTone, compactBRL, drilldownUrl, DEFAULT_VIEW } from '@/lib/dashboardView';

const U = '11111111-2222-3333-4444-555555555555';

describe('filtros do Dashboard na URL', () => {
  it('URL vazia = padrão; só grava o que difere', () => {
    expect(parseView(new URLSearchParams(''))).toEqual({ ...DEFAULT_VIEW });
    expect(serializeView(DEFAULT_VIEW).toString()).toBe('');
  });

  it('ida e volta com período personalizado, unidade, frente e provisionados', () => {
    const v = { preset: 'custom' as const, from: '2026-08-01', to: '2026-09-30', unitId: U, frontId: U.replace('1111', '9999'), includeProvisioned: true, regime: 'caixa' as const };
    const back = parseView(serializeView(v));
    expect(back).toEqual(v);
  });

  it('valores inválidos voltam ao padrão (sem quebrar a tela)', () => {
    const v = parseView(new URLSearchParams('periodo=qualquer&unidade=nao-e-uuid&prov=talvez&de=2026-01-01'));
    expect(v.preset).toBe('current_month');
    expect(v.unitId).toBe('');
    expect(v.includeProvisioned).toBe(false);
    expect(v.from).toBeUndefined();                   // datas só valem com período personalizado
    expect(parseView(new URLSearchParams('periodo=custom&de=ontem&ate=2026-09-30'))).toMatchObject({ from: undefined, to: '2026-09-30' });
  });

  it('"all" do seletor não vai para a URL', () => {
    expect(serializeView({ ...DEFAULT_VIEW, unitId: 'all', frontId: 'all' }).toString()).toBe('');
  });
});

describe('exibição', () => {
  it('a cor da variação depende de ser receita ou despesa', () => {
    expect(variationTone('receita', 12)).toBe('good');
    expect(variationTone('receita', -12)).toBe('bad');
    expect(variationTone('despesa', 12)).toBe('bad');
    expect(variationTone('despesa', -12)).toBe('good');
    expect(variationTone('despesa', null)).toBe('neutral');
    expect(variationTone('receita', 0.01)).toBe('neutral');
  });

  it('valor curto de eixo não vira "0k"', () => {
    expect(compactBRL(0)).toBe('R$ 0');
    expect(compactBRL(450)).toBe('R$ 450');
    expect(compactBRL(1200)).toBe('R$ 1,2 mil');
    expect(compactBRL(3_400_000)).toBe('R$ 3,4 mi');
    expect(compactBRL(-2500)).toBe('-R$ 2,5 mil');
  });

  it('link de detalhe do cartão', () => {
    expect(drilldownUrl({ kind: 'receita', from: '2026-09-01', to: '2026-09-30', includeProvisioned: false }))
      .toBe('/lancamentos?type=receita&dateFrom=2026-09-01&dateTo=2026-09-30&regime=caixa');
    expect(drilldownUrl({ kind: 'despesa', from: '2026-09-01', to: '2026-09-30', includeProvisioned: true }))
      .toContain('regime=dashboard');
  });
});
