import { describe, it, expect } from 'vitest';
import {
  classifyDuplicate, looksLikeTest, looksLikeTransfer, suggestCategory, suggestStatus, suggestUnitLabel,
} from '@/lib/reviewSuggestions';

const tx = (o: Partial<any> = {}) => ({
  id: o.id || 'a', description: o.description ?? 'x', type: o.type ?? 'despesa', status: o.status ?? 'pago',
  net_amount: o.net_amount ?? 100, amount: o.amount ?? 100, competence_date: '2026-07-01',
  due_date: null, payment_date: null, category_id: null, unit_id: o.unit_id ?? null,
  account_id: o.account_id ?? null, affects_dre: true, affects_cashflow: true,
});

describe('sugestões da conferência', () => {
  it('detecta lançamento de teste', () => {
    expect(looksLikeTest({ description: 'Venda de sistema TESTE' })).toBe(true);
    expect(looksLikeTest({ description: 'Compra de farinha' })).toBe(false);
  });

  it('detecta transferência entre contas', () => {
    expect(looksLikeTransfer({ description: 'Transferência entre contas' })).toBe(true);
    expect(looksLikeTransfer({ description: 'Aluguel loja' })).toBe(false);
  });

  it('classifica duplicidades', () => {
    expect(classifyDuplicate([tx({ unit_id: 'u1' }), tx({ id: 'b', unit_id: 'u1' })]).severity).toBe('forte');
    expect(classifyDuplicate([tx({ unit_id: 'u1' }), tx({ id: 'b', unit_id: 'u2' })]).severity).toBe('conferir');
    expect(classifyDuplicate([tx({ net_amount: 0.99 }), tx({ id: 'b', net_amount: 0.99 })]).severity).toBe('legitimo');
  });

  it('sugere status coerente sem tocar no tipo', () => {
    expect(suggestStatus({ type: 'receita', status: 'pago' })).toBe('recebido');
    expect(suggestStatus({ type: 'despesa', status: 'recebido' })).toBe('pago');
    expect(suggestStatus({ type: 'despesa', status: 'pago' })).toBeNull();
  });

  it('marca baixa confiança em descrições genéricas', () => {
    expect(suggestCategory('Top Store - Produto de Limpeza').categoryName).toBe('Material de Limpeza');
    expect(suggestCategory('Nupay').lowConfidence).toBe(true);
    expect(suggestCategory('iFood').categoryName).toBeUndefined();
  });

  it('sugere Fábrica apenas para matéria-prima', () => {
    expect(suggestUnitLabel(tx() as any, 'Matéria-Prima')).toBe('Fábrica');
    expect(suggestUnitLabel(tx() as any, 'Aluguel')).toBeNull();
  });
});
