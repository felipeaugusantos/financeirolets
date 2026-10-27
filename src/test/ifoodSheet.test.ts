import { describe, it, expect } from 'vitest';
import { parseIfoodSheet, parseMoney, parseSheetDate } from '@/lib/ifoodSheet';

describe('planilha do Portal do Parceiro iFood', () => {
  it('lê valores em reais e datas brasileiras', () => {
    expect(parseMoney('R$ 1.234,56')).toBe(1234.56);
    expect(parseMoney('(10,00)')).toBe(-10);
    expect(parseSheetDate('05/10/2026 20:15')).toBe('2026-10-05');
  });

  it('acha o cabeçalho abaixo de títulos, lê os pedidos e ignora repetidos e total', () => {
    const { orders, missing } = parseIfoodSheet([
      ['Relatório financeiro'],
      ['ID do pedido', 'Data do pedido', 'Status', 'Valor bruto', 'Comissão', 'Taxa de transação', 'Promoção loja', 'Valor líquido', 'Data do repasse'],
      ['A1', '05/10/2026', 'CONCLUDED', '100,00', '-12,00', '-3,20', '5,00', '79,80', '14/10/2026'],
      ['A1', '05/10/2026', 'CONCLUDED', '100,00', '-12,00', '-3,20', '5,00', '79,80', '14/10/2026'],
      ['Total', '', '', '100,00'],
    ]);
    expect(missing).toEqual([]);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ orderId: 'A1', orderedAt: '2026-10-05', gross: 100, commission: 12, paymentFee: 3.2, merchantPromo: 5, net: 79.8, payoutDate: '2026-10-14' });
  });

  it('sem coluna de líquido calcula bruto menos comissão, taxa e promoção da loja', () => {
    const { orders, missing } = parseIfoodSheet([['Pedido', 'Valor bruto', 'Comissão'], ['B2', '50,00', '6,00']]);
    expect(missing).toEqual(['valor líquido']);
    expect(orders[0].net).toBe(44);
  });
});
