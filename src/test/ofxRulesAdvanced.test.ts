import { describe, expect, it } from 'vitest';
import {
  applyRules, matchingRules, ruleAllocations, ruleMatches, type OfxRule,
} from '@/lib/ofxMatch';

const rule = (over: Partial<OfxRule> = {}): OfxRule => ({
  id: 'r1',
  pattern: 'aluguel',
  match_type: 'contains',
  applies_to: 'ambos',
  category_id: 'cat-aluguel',
  unit_id: null,
  front_id: null,
  partner_id: null,
  priority: 10,
  active: true,
  ...over,
});

describe('regras de conciliação — unidade da conta do extrato', () => {
  it('usa a unidade padrão da conta quando use_statement_unit está ligado', () => {
    const out = applyRules('PIX RECEBIDO', 100, [rule({ pattern: 'pix', use_statement_unit: true, unit_id: 'fixa' })],
      { accountId: 'acc-1', accountUnitId: 'unid-boulevard' });
    expect(out?.unit_id).toBe('unid-boulevard');
  });

  it('mantém a unidade fixa quando a opção está desligada', () => {
    const out = applyRules('PIX RECEBIDO', 100, [rule({ pattern: 'pix', unit_id: 'fixa' })],
      { accountId: 'acc-1', accountUnitId: 'unid-boulevard' });
    expect(out?.unit_id).toBe('fixa');
  });

  it('fica sem unidade quando a conta do extrato não tem unidade padrão', () => {
    const out = applyRules('PIX RECEBIDO', 100, [rule({ pattern: 'pix', use_statement_unit: true })], { accountId: 'acc-1' });
    expect(out?.unit_id).toBeNull();
  });
});

describe('regras de conciliação — rateio na regra', () => {
  it('devolve o rateio 50/50 definido na regra', () => {
    const out = applyRules('CPFL ENERGIA', -500, [rule({
      pattern: 'cpfl',
      allocations: [
        { unit_id: 'u1', front_id: null, percentage: 50 },
        { unit_id: 'u2', front_id: null, percentage: 50 },
      ],
    })]);
    expect(out?.allocations).toHaveLength(2);
    expect(out?.allocations?.reduce((s, a) => s + a.percentage, 0)).toBe(100);
  });

  it('descarta linhas de rateio sem alvo ou com percentual zerado', () => {
    const r = rule({
      allocations: [
        { unit_id: 'u1', front_id: null, percentage: 100 },
        { unit_id: null, front_id: null, percentage: 0 },
        { unit_id: null, front_id: null, percentage: 20 },
      ],
    });
    expect(ruleAllocations(r)).toEqual([{ unit_id: 'u1', front_id: null, percentage: 100 }]);
  });

  it('trata rateio ausente ou inválido como sem rateio', () => {
    expect(ruleAllocations(rule({ allocations: null }))).toBeNull();
    expect(ruleAllocations(rule({ allocations: [] }))).toBeNull();
    expect(ruleAllocations(rule({ allocations: 'lixo' as never }))).toBeNull();
  });
});

describe('regras de conciliação — exceções', () => {
  it('não aplica quando o memo contém um termo de exceção', () => {
    const r = rule({ pattern: 'pix recebido', exclude_pattern: 'martinho, ifood' });
    expect(ruleMatches(r, 'PIX RECEBIDO PADARIA MARTINHO', 100)).toBe(false);
    expect(ruleMatches(r, 'PIX RECEBIDO JOAO', 100)).toBe(true);
  });

  it('ignora acentos e espaços em branco nas exceções', () => {
    const r = rule({ pattern: 'pix', exclude_pattern: ' Comércio ,, ' });
    expect(ruleMatches(r, 'PIX COMERCIO LTDA', 100)).toBe(false);
  });
});

describe('regras de conciliação — faixa de valor', () => {
  const r = rule({ min_amount: 1000, max_amount: 4200 });

  it('aplica somente dentro da faixa, usando o valor em módulo', () => {
    expect(ruleMatches(r, 'ALUGUEL LOJA', -4000)).toBe(true);
    expect(ruleMatches(r, 'ALUGUEL LOJA', -4300)).toBe(false);
    expect(ruleMatches(r, 'ALUGUEL LOJA', -900)).toBe(false);
  });

  it('aceita qualquer valor quando a faixa não é preenchida', () => {
    expect(ruleMatches(rule(), 'ALUGUEL LOJA', -99999)).toBe(true);
  });
});

describe('regras de conciliação — filtro por conta e prioridade', () => {
  const fabrica = rule({ id: 'a', pattern: 'pix recebido', account_id: 'acc-fabrica', category_id: 'cat-atacado', priority: 1 });
  const geral = rule({ id: 'b', pattern: 'pix recebido', account_id: null, category_id: 'cat-loja', priority: 5 });

  it('o mesmo texto vira categoria diferente conforme a conta do extrato', () => {
    expect(applyRules('PIX RECEBIDO', 100, [fabrica, geral], { accountId: 'acc-fabrica' })?.category_id).toBe('cat-atacado');
    expect(applyRules('PIX RECEBIDO', 100, [fabrica, geral], { accountId: 'acc-boulevard' })?.category_id).toBe('cat-loja');
  });

  it('lista todas as regras que casam, da maior prioridade para a menor', () => {
    const all = matchingRules('PIX RECEBIDO', 100, [geral, fabrica], { accountId: 'acc-fabrica' });
    expect(all.map(x => x.id)).toEqual(['a', 'b']);
  });

  it('regra inativa nunca é aplicada', () => {
    expect(applyRules('PIX RECEBIDO', 100, [rule({ pattern: 'pix', active: false })])).toBeNull();
  });
});
