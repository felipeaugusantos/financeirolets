import { describe, it, expect } from 'vitest';
import { suggestRulePattern, buildRuleFromEntry } from '@/lib/ruleFromEntry';

const base = { pattern: 'fornecedor abc', amount: -150, accountId: 'acc', categoryId: 'cat', unitId: 'u1', frontId: null, partnerId: null, userId: 'me' };

describe('regra a partir do lançamento', () => {
  it('sugere o termo sem códigos e palavras genéricas', () => {
    expect(suggestRulePattern('DEB PIX ENVIADO FORNECEDOR ABC 12345')).toBe('fornecedor abc');
  });
  it('saída vira regra de despesa da conta atual', () => {
    const r = buildRuleFromEntry(base)!;
    expect(r.applies_to).toBe('despesa');
    expect(r.account_id).toBe('acc');
    expect(r.unit_id).toBe('u1');
  });
  it('sem categoria não salva regra', () => {
    expect(buildRuleFromEntry({ ...base, categoryId: null })).toBeNull();
  });
  it('termo com menos de 3 letras não salva', () => {
    expect(buildRuleFromEntry({ ...base, pattern: 'ab' })).toBeNull();
  });
  it('rateio é gravado em percentual e substitui a unidade fixa', () => {
    const r = buildRuleFromEntry({ ...base, allocations: [{ unit_id: 'u1', front_id: null, value: 50 }, { unit_id: 'u2', front_id: null, value: 50 }] })!;
    expect(r.unit_id).toBeNull();
    expect(r.allocations).toEqual([{ unit_id: 'u1', front_id: null, percentage: 50 }, { unit_id: 'u2', front_id: null, percentage: 50 }]);
  });
});

import { commonRulePattern, batchRuleDirection } from '@/lib/ruleFromEntry';
describe('regra em lote', () => {
  it('usa só as palavras comuns a todas as linhas', () => {
    expect(commonRulePattern(['PIX ENVIADO JOAO SILVA PADARIA 123', 'TED JOAO SILVA 05/10'])).toBe('joao silva');
  });
  it('sem palavra comum, deixa o termo vazio para o operador digitar', () => {
    expect(commonRulePattern(['ENERGIA CEMIG', 'ALUGUEL LOJA'])).toBe('');
  });
  it('direção só é definida quando todas têm o mesmo sinal', () => {
    expect(batchRuleDirection([-10, -5])).toBe('despesa');
    expect(batchRuleDirection([10, 5])).toBe('receita');
    expect(batchRuleDirection([10, -5])).toBe('ambos');
  });
});
