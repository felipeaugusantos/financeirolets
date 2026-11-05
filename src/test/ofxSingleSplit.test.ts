import { describe, expect, it } from 'vitest';
import { resolveOfxSplit } from '@/components/ofx/OfxAllocationEditor';

describe('rateio manual de uma linha OFX', () => {
  it('envia a divisão 50/50 para duas unidades em um único lançamento', () => {
    const result = resolveOfxSplit([
      { unit_id: 'fabrica', front_id: null, pct: '50' },
      { unit_id: 'cafe', front_id: null, pct: '50' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.allocations).toEqual([
      { unit_id: 'fabrica', front_id: null, allocation_type: 'percentual', value: 50 },
      { unit_id: 'cafe', front_id: null, allocation_type: 'percentual', value: 50 },
    ]);
  });
  it('bloqueia um rateio que não fecha 100%', () => {
    expect(resolveOfxSplit([{ unit_id: 'fabrica', front_id: null, pct: '50' }]).valid).toBe(false);
  });
  it('exige uma unidade ou frente em cada parcela', () => {
    expect(resolveOfxSplit([{ unit_id: null, front_id: null, pct: '100' }]).valid).toBe(false);
  });
  it('aceita percentuais com vírgula e rateio por frente', () => {
    const result = resolveOfxSplit([
      { unit_id: null, front_id: 'corporativo', pct: '33,5' },
      { unit_id: null, front_id: 'varejo', pct: '66,5' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.total).toBe(100);
    expect(result.allocations[0].value).toBe(33.5);
  });
  it('rejeita parcelas negativas, zeradas ou inválidas', () => {
    for (const pct of ['-1', '0', 'abc']) {
      expect(resolveOfxSplit([
        { unit_id: 'fabrica', front_id: null, pct },
        { unit_id: 'cafe', front_id: null, pct: '100' },
      ]).valid).toBe(false);
    }
  });
});