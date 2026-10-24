import { describe, expect, it } from 'vitest';
import { customerAverages, inactiveCustomers, monthToDateComparison, orderDueDate } from '@/lib/crmRules';

const o = (company_id: string, order_date: string, total_amount: number, quantity_boxes = 1, status = 'pendente') => ({ company_id, order_date, total_amount, quantity_boxes, status });

describe('Pedidos de distribuição', () => {
  it('boleto 7 dias vence 7 dias após o envio: envio 22/10 vence 29/10', () => {
    expect(orderDueDate('2026-10-22', 'boleto_7')).toBe('2026-10-29');
  });
  it('à vista vence no próprio dia', () => {
    expect(orderDueDate('2026-10-22', 'a_vista')).toBe('2026-10-22');
  });
  it('compara até o dia 22 deste mês com até o dia 22 do mês anterior', () => {
    const r = monthToDateComparison([o('a', '2026-10-05', 300), o('a', '2026-09-20', 200), o('a', '2026-09-25', 999)], '2026-10-22');
    expect(r.current.amount).toBe(300);
    expect(r.previous.amount).toBe(200);
    expect(r.variation).toBeCloseTo(0.5);
  });
  it('dia 31 compara com o último dia de um mês de 30 dias', () => {
    const r = monthToDateComparison([o('a', '2026-09-30', 100)], '2026-10-31');
    expect(r.previous.amount).toBe(100);
  });
  it('pedidos cancelados não entram nos indicadores', () => {
    const r = monthToDateComparison([o('a', '2026-10-05', 300, 1, 'cancelado')], '2026-10-22');
    expect(r.current.amount).toBe(0);
  });
  it('cliente que comprou nos últimos 3 meses e não neste mês aparece como sem pedido', () => {
    expect(inactiveCustomers([o('a', '2026-09-10', 1), o('b', '2026-09-10', 1), o('b', '2026-10-02', 1), o('c', '2026-05-01', 1)], '2026-10-22')).toEqual(['a']);
  });
  it('média mensal por cliente divide pelos meses com pedido', () => {
    const [a] = customerAverages([o('a', '2026-09-01', 100, 2), o('a', '2026-09-15', 100, 2), o('a', '2026-10-01', 400, 8)]);
    expect(a.avgAmount).toBe(300);
    expect(a.avgBoxes).toBe(6);
  });
});
