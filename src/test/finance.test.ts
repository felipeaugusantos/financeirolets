import { describe, it, expect } from 'vitest';
import {
  splitByUnit,
  valueForUnitFilter,
  buildAllocationMap,
  transactionFingerprint,
  isPaidStatus,
  isProvisionedStatus,
  isCancelled,
  affectsDre,
  affectsCashflow,
  NO_UNIT_KEY,
} from '@/lib/finance';

const U1 = 'unit-1';
const U2 = 'unit-2';

describe('regras financeiras comuns', () => {
  it('classifica status de forma única', () => {
    expect(isPaidStatus('pago')).toBe(true);
    expect(isPaidStatus('recebido')).toBe(true);
    expect(isProvisionedStatus('pendente')).toBe(true);
    expect(isProvisionedStatus('agendado')).toBe(true);
    expect(isCancelled('cancelado')).toBe(true);
    expect(isPaidStatus('cancelado')).toBe(false);
  });

  it('trata flags ausentes como verdadeiras', () => {
    expect(affectsDre({})).toBe(true);
    expect(affectsCashflow({ affects_cashflow: false })).toBe(false);
  });

  it('lançamento sem unidade e sem rateio vai para "Sem unidade" e não some', () => {
    const tx = { id: 't1', unit_id: null, net_amount: 100 };
    const splits = splitByUnit(tx, new Map());
    expect(splits).toEqual([{ unitKey: NO_UNIT_KEY, value: 100 }]);
  });

  it('rateio percentual distribui o valor entre unidades', () => {
    const allocMap = buildAllocationMap([
      { transaction_id: 't2', unit_id: U1, allocation_type: 'percentual', percentage: 70, amount: null },
      { transaction_id: 't2', unit_id: U2, allocation_type: 'percentual', percentage: 30, amount: null },
    ]);
    const tx = { id: 't2', unit_id: null, net_amount: 200 };
    expect(valueForUnitFilter(tx, allocMap, U1)).toBeCloseTo(140);
    expect(valueForUnitFilter(tx, allocMap, U2)).toBeCloseTo(60);
    expect(valueForUnitFilter(tx, allocMap, undefined)).toBe(200);
  });

  it('consolidado = soma das unidades + sem unidade', () => {
    const allocMap = buildAllocationMap([
      { transaction_id: 't3', unit_id: U1, allocation_type: 'valor', percentage: null, amount: 30 },
      { transaction_id: 't3', unit_id: null, allocation_type: 'valor', percentage: null, amount: 70 },
    ]);
    const tx = { id: 't3', unit_id: null, net_amount: 100 };
    const total = splitByUnit(tx, allocMap).reduce((s, x) => s + x.value, 0);
    expect(total).toBe(100);
    expect(valueForUnitFilter(tx, allocMap, U1)).toBe(30);
    expect(valueForUnitFilter(tx, allocMap, NO_UNIT_KEY)).toBe(70);
  });

  it('valores negativos (estornos) não são descartados', () => {
    const tx = { id: 't4', unit_id: U1, net_amount: -50 };
    expect(valueForUnitFilter(tx, new Map(), U1)).toBe(-50);
  });

  it('fingerprint identifica o mesmo lançamento independentemente de acentos/espaços', () => {
    const a = transactionFingerprint({ type: 'despesa', description: '  Café  Especial ', amount: 10, competence_date: '2026-08-01' });
    const b = transactionFingerprint({ type: 'despesa', description: 'cafe especial', amount: 10.0, competence_date: '2026-08-01' });
    expect(a).toBe(b);
  });
});
