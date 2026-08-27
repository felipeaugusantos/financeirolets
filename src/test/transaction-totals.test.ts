import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  sumTotals, sumAllPages, checkTotals, PAGE_SIZE, TotalsRow,
} from '@/lib/transactionTotals';

const row = (type: string, net: number, status = 'pago'): TotalsRow =>
  ({ type, net_amount: net, status });

describe('totais de lançamentos', () => {
  it('soma receitas e despesas e ignora cancelados', () => {
    const t = sumTotals([
      row('receita', 1000),
      row('receita', 500.55),
      row('despesa', 300.15),
      row('despesa', 999, 'cancelado'),
      row('receita', 999, 'cancelado'),
    ]);
    expect(t.receitas).toBe(1500.55);
    expect(t.despesas).toBe(300.15);
    expect(t.saldo).toBe(1200.4);
    expect(t.count).toBe(3);
  });

  it('agrega TODAS as páginas, não só as primeiras 1.000 linhas', async () => {
    // 2.221 linhas, como o volume real do sistema.
    const all = Array.from({ length: 2221 }, () => row('receita', 10));
    const pages: number[] = [];
    const t = await sumAllPages(async (from, to) => {
      pages.push(from);
      return all.slice(from, to + 1);
    });
    expect(pages).toEqual([0, PAGE_SIZE, PAGE_SIZE * 2]);
    expect(t.count).toBe(2221);
    expect(t.receitas).toBe(22210);
    expect(t.truncated).toBe(false);
  });

  it('não soma duas vezes uma linha repetida entre páginas', async () => {
    const mk = (i: number) => ({ id: `id-${i}`, type: 'receita', net_amount: 10, status: 'pago' });
    const page0 = Array.from({ length: PAGE_SIZE }, (_, i) => mk(i));
    // A última linha da página 0 reaparece no topo da página 1 (ordem instável).
    const page1 = [mk(PAGE_SIZE - 1), mk(PAGE_SIZE), mk(PAGE_SIZE + 1)];
    const t = await sumAllPages(async from => (from === 0 ? page0 : page1));
    expect(t.count).toBe(PAGE_SIZE + 2);
    expect(t.receitas).toBe((PAGE_SIZE + 2) * 10);
  });

  it('para exatamente no fim quando o total é múltiplo da página', async () => {
    const all = Array.from({ length: PAGE_SIZE * 2 }, () => row('despesa', 1));
    const t = await sumAllPages(async (from, to) => all.slice(from, to + 1));
    expect(t.count).toBe(PAGE_SIZE * 2);
    expect(t.despesas).toBe(PAGE_SIZE * 2);
  });

  it('acusa divergência entre agregação e lista completa', () => {
    const visible = [row('receita', 100), row('despesa', 40)];
    const ok = checkTotals(sumTotals(visible), visible, true);
    expect(ok.ok).toBe(true);
    expect(ok.deltaSaldo).toBe(0);

    const wrong = { receitas: 100, despesas: 10, saldo: 90, count: 2, truncated: false };
    const bad = checkTotals(wrong, visible, true);
    expect(bad.ok).toBe(false);
    expect(bad.deltaDespesas).toBe(-30);
  });

  it('lista parcial não é tratada como divergência', () => {
    const visible = [row('receita', 100)];
    const aggregated = { receitas: 900, despesas: 0, saldo: 900, count: 9, truncated: false };
    const res = checkTotals(aggregated, visible, false);
    expect(res.ok).toBe(true);
    expect(res.partialList).toBe(true);
  });
});

describe('guarda de regressão do cálculo de totais', () => {
  const src = readFileSync('src/hooks/useTransactions.ts', 'utf8');

  it('useTransactions usa a agregação paginada', () => {
    expect(src).toContain('sumAllPages');
    expect(src).toMatch(/\.range\(/);
  });

  it('não volta a somar os totais a partir das linhas exibidas', () => {
    // Padrão antigo: reduce sobre a lista carregada para montar setTotals.
    const bad = /setTotals\(\s*\{\s*receitas/.test(src)
      || /typed\.filter\([^)]*type === 'receita'\)\s*\.reduce/.test(src);
    expect(bad).toBe(false);
  });
});
