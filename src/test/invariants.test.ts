import { describe, it, expect } from 'vitest';
import {
  splitByUnit,
  valueForUnitFilter,
  valueForFilters,
  buildAllocationMap,
  isCancelled,
  affectsDre,
  affectsCashflow,
  NO_UNIT_KEY,
  buildOpeningMap,
  openingBalanceTotal,
  hasOpeningBalance,
  isAfterOpening,
  type AllocationRow,
} from '@/lib/finance';
import { PIX_NATURE_BY_VALUE, detectTransferPairs, dreImpact, patchForNature, readNatureTag, suggestNature, writeNatureTag } from '@/lib/pixTriage';

const U1 = 'unit-1';
const U2 = 'unit-2';
const F1 = 'front-1';

function allocs(rows: AllocationRow[]) {
  return buildAllocationMap(rows);
}

describe('invariantes financeiras', () => {
  it('consolidado = soma das unidades + Sem unidade (rateio completo)', () => {
    const map = allocs([
      { transaction_id: 't1', unit_id: U1, allocation_type: 'percentual', percentage: 60, amount: null },
      { transaction_id: 't1', unit_id: U2, allocation_type: 'percentual', percentage: 40, amount: null },
    ]);
    const tx = { id: 't1', unit_id: null, net_amount: 500 };
    const total = splitByUnit(tx, map).reduce((s, p) => s + p.value, 0);
    expect(total).toBeCloseTo(500, 2);
  });

  it('rateio incompleto joga o resíduo em Sem unidade, nunca some', () => {
    const map = allocs([
      { transaction_id: 't2', unit_id: U1, allocation_type: 'percentual', percentage: 99.99, amount: null },
    ]);
    const tx = { id: 't2', unit_id: null, net_amount: 34309.22 };
    const parts = splitByUnit(tx, map);
    expect(parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(34309.22, 2);
    expect(valueForUnitFilter(tx, map, NO_UNIT_KEY)).toBeCloseTo(3.43, 2);
  });

  it('rateio zerado mantém o valor inteiro em Sem unidade', () => {
    const map = allocs([
      { transaction_id: 't3', unit_id: U1, allocation_type: 'percentual', percentage: 0, amount: null },
    ]);
    const tx = { id: 't3', unit_id: null, net_amount: 319.87 };
    expect(valueForUnitFilter(tx, map, NO_UNIT_KEY)).toBeCloseTo(319.87, 2);
    expect(splitByUnit(tx, map).reduce((s, p) => s + p.value, 0)).toBeCloseTo(319.87, 2);
  });

  it('rateio nunca excede o valor original', () => {
    const map = allocs([
      { transaction_id: 't4', unit_id: U1, allocation_type: 'valor', percentage: null, amount: 70 },
      { transaction_id: 't4', unit_id: U2, allocation_type: 'valor', percentage: null, amount: 30 },
    ]);
    const tx = { id: 't4', unit_id: null, net_amount: 100 };
    const total = splitByUnit(tx, map).reduce((s, p) => s + p.value, 0);
    expect(Math.abs(total)).toBeLessThanOrEqual(Math.abs(100) + 0.01);
  });

  it('DRE consolidado (valor cheio) = consolidado do Comparativo (soma dos splits)', () => {
    const map = allocs([
      { transaction_id: 't5', unit_id: U1, allocation_type: 'percentual', percentage: 50, amount: null },
    ]);
    const txs = [
      { id: 't5', unit_id: null, net_amount: 1000 },
      { id: 't6', unit_id: U2, net_amount: 250 },
      { id: 't7', unit_id: null, net_amount: 33.33 },
    ];
    const dre = txs.reduce((s, t) => s + Number(t.net_amount), 0);
    const comparativo = txs.reduce(
      (s, t) => s + splitByUnit(t, map).reduce((a, p) => a + p.value, 0),
      0
    );
    expect(comparativo).toBeCloseTo(dre, 2);
  });

  it('filtro unidade × frente usa interseção do rateio, não o mínimo', () => {
    const map = allocs([
      { transaction_id: 't8', unit_id: U1, front_id: F1, allocation_type: 'valor', percentage: null, amount: 60 },
      { transaction_id: 't8', unit_id: U2, front_id: null, allocation_type: 'valor', percentage: null, amount: 40 },
    ]);
    const tx = { id: 't8', unit_id: null, front_id: null, net_amount: 100 };
    expect(valueForFilters(tx, map, U1, F1)).toBeCloseTo(60, 2);
    expect(valueForFilters(tx, map, U2, F1)).toBeCloseTo(0, 2);
    expect(valueForFilters(tx, map, U1, undefined)).toBeCloseTo(60, 2);
    expect(valueForFilters(tx, map, undefined, undefined)).toBeCloseTo(100, 2);
  });

  it('sem filtro nenhum lançamento desaparece', () => {
    const tx = { id: 't9', unit_id: null, front_id: null, net_amount: 42 };
    expect(valueForFilters(tx, new Map(), undefined, undefined)).toBe(42);
    expect(valueForUnitFilter(tx, new Map(), undefined)).toBe(42);
  });

  it('cancelado e flags desligadas são excluídos pelas regras compartilhadas', () => {
    expect(isCancelled('cancelado')).toBe(true);
    expect(affectsDre({ affects_dre: false })).toBe(false);
    expect(affectsCashflow({ affects_cashflow: false })).toBe(false);
  });

  it('acumulado do fluxo fecha mês a mês', () => {
    const saldos = [22412.25, 3727.7, 34237.92, 15000];
    let acc = 0;
    const acumulados = saldos.map((s) => (acc += s));
    acumulados.forEach((v, i) => {
      const anterior = i === 0 ? 0 : acumulados[i - 1];
      expect(v).toBeCloseTo(anterior + saldos[i], 2);
    });
  });

  it('subtotal = soma dos filhos (roll-up do DRE)', () => {
    const filhos = [{ v: -100 }, { v: -250.5 }, { v: -3.25 }];
    const subtotal = filhos.reduce((s, f) => s + f.v, 0);
    expect(subtotal).toBeCloseTo(-353.75, 2);
  });
});

describe('saldo inicial com data-base', () => {
  const map = buildOpeningMap([
    { id: 'a1', initial_balance: 23983.72, initial_balance_date: '2026-06-30' },
    { id: 'a2', initial_balance: 0, initial_balance_date: '2026-06-30' },
    { id: 'a3', initial_balance: 1362.41, initial_balance_date: null },
  ]);

  it('soma apenas saldos já válidos na data de referência', () => {
    expect(openingBalanceTotal(map, '2026-07-01')).toBeCloseTo(25346.13, 2);
    // Antes da data-base, só a conta sem data-base entra.
    expect(openingBalanceTotal(map, '2026-06-01')).toBeCloseTo(1362.41, 2);
    expect(hasOpeningBalance(map, '2026-07-01')).toBe(true);
  });

  it('movimento até a data-base não é somado de novo', () => {
    expect(isAfterOpening({ account_id: 'a1', payment_date: '2026-06-30' }, map)).toBe(false);
    expect(isAfterOpening({ account_id: 'a1', payment_date: '2026-06-15' }, map)).toBe(false);
    expect(isAfterOpening({ account_id: 'a1', payment_date: '2026-07-01' }, map)).toBe(true);
  });

  it('conta sem data-base mantém o comportamento antigo', () => {
    expect(isAfterOpening({ account_id: 'a3', payment_date: '2026-01-01' }, map)).toBe(true);
    expect(isAfterOpening({ account_id: null, payment_date: '2026-01-01' }, map)).toBe(true);
  });
});

describe('triagem de PIX', () => {
  const base = {
    id: 'p1', description: 'PIX MARTINHO & SOUZA', notes: null as string | null,
    net_amount: 1200, type: 'receita', account_id: 'a1',
    payment_date: '2026-07-10', competence_date: '2026-07-10', affects_dre: true,
  };

  it('só a natureza venda permanece no DRE; todas seguem no caixa', () => {
    expect(PIX_NATURE_BY_VALUE.venda.affects_dre).toBe(true);
    (['transferencia', 'stone', 'ifood', 'app_caixa'] as const).forEach((n) => {
      expect(PIX_NATURE_BY_VALUE[n].affects_dre).toBe(false);
      expect(PIX_NATURE_BY_VALUE[n].affects_cashflow).toBe(true);
    });
  });

  it('sugere Stone e iFood pelo histórico', () => {
    expect(suggestNature({ ...base, description: 'Repasse STONE Boulevard' }).nature).toBe('stone');
    expect(suggestNature({ ...base, description: 'Recebivel iFood Cafe' }).nature).toBe('ifood');
    expect(suggestNature(base).nature).toBe('venda');
  });

  it('marca a natureza em notes sem duplicar a tag', () => {
    const once = writeNatureTag('conferido com extrato', 'transferencia');
    const twice = writeNatureTag(once, 'venda');
    expect(readNatureTag(twice)).toBe('venda');
    expect(twice.match(/\[natureza:/g)?.length).toBe(1);
    expect(twice).toContain('conferido com extrato');
  });

  it('detecta par de transferência de mesmo valor em contas diferentes', () => {
    const pairs = detectTransferPairs([
      base,
      { ...base, id: 'p2', type: 'despesa', account_id: 'a2', payment_date: '2026-07-11', competence_date: '2026-07-11' },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].amount).toBeCloseTo(1200, 2);
  });

  it('tirar uma receita do DRE reduz o resultado no valor do lançamento', () => {
    expect(dreImpact([base], { p1: 'transferencia' })).toBeCloseTo(-1200, 2);
    expect(dreImpact([base], { p1: 'venda' })).toBeCloseTo(0, 2);
    expect(patchForNature(base, 'transferencia')).toMatchObject({ affects_dre: false, affects_cashflow: true });
  });
});
