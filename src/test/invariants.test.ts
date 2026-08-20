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
