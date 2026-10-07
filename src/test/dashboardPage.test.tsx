import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ data: {} as Record<string, unknown>, reload: vi.fn() }));
vi.mock('@/hooks/useDashboard', () => ({ useDashboard: () => ({ ...h.data, reload: h.reload }) }));
vi.mock('@/hooks/useSupabaseCrud', () => ({ useSupabaseCrud: () => ({ data: [] }) }));
// jsdom não mede tamanho: o gráfico não é o foco destes testes.
vi.mock('recharts', async (orig) => {
  const real = await orig<typeof import('recharts')>();
  return { ...real, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> };
});

import Dashboard from '@/pages/Dashboard';

const base = {
  loading: false, error: null, refreshing: false, updatedAt: new Date('2026-09-15T14:35:00').getTime(),
  saldoTotal: 5600, saldoInicialConfigurado: true, movimentacaoCalculada: 600, saldoInicialTotal: 5000,
  receitasMes: 1000, despesasMes: 400, receitasProvisionadas: 0, despesasProvisionadas: 0,
  contasAtrasadas: 2, vencendoHoje: 0, overdueBills: [], dueTodayBills: [],
  monthlyData: [{ label: 'Set/26', receitas: 1000, despesas: 400, receitasProv: 0, despesasProv: 0 }],
  categoryData: [], receitaCategoryData: [], semCategoria: 0, semCategoriaReceita: 0, semCategoriaDespesa: 0, semUnidade: 0,
  margemContribuicao: 600, variacaoReceita: 12.5, variacaoDespesa: 12.5, unitRanking: [],
};

let root: Root | null = null;
const text = () => document.body.textContent ?? '';
const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div>; };

async function mount(url: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}
const card = (title: RegExp) =>
  Array.from(document.querySelectorAll('[class*="rounded-2xl"]')).find(el => title.test(el.textContent ?? '') && el.querySelector('.font-heading')) as HTMLElement;

beforeAll(() => {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes('not wrapped in act')) return;
    original(...args);
  };
});
beforeEach(() => { root?.unmount(); root = null; document.body.innerHTML = ''; h.data = { ...base }; h.reload.mockClear(); });

describe('Dashboard (tela)', () => {
  it('"Margem" virou "Resultado", com a margem em % da receita', async () => {
    await mount('/');
    expect(text()).toContain('Resultado');
    expect(text()).not.toContain('Margem');
    expect(text()).toContain('60.0% da receita');
  });

  it('variação com cor: receita acima é boa, despesa acima é ruim', async () => {
    await mount('/');
    const rec = card(/Receitas do mês/)!.querySelector('span[class*="text-"]')!;
    const desp = card(/Despesas do mês/)!.querySelector('span[class*="text-"]')!;
    expect(rec.className).toContain('text-success');
    expect(desp.className).toContain('text-destructive');
  });

  it('cartão de receitas abre os lançamentos do mesmo período, tipo e regime', async () => {
    await mount('/');
    await act(async () => { (card(/Receitas do mês/)!).click(); });
    const where = document.querySelector('[data-testid="where"]')!.textContent!;
    expect(where).toMatch(/^\/lancamentos\?/);
    expect(where).toContain('type=receita');
    expect(where).toContain('regime=caixa');
    expect(where).toMatch(/dateFrom=\d{4}-\d{2}-01/);
  });

  it('com filtro de unidade na URL o cartão não vira link (a lista não divide rateios)', async () => {
    await mount('/?unidade=11111111-2222-3333-4444-555555555555');
    expect(card(/Receitas do mês/)!.getAttribute('role')).toBeNull();
  });

  it('mostra quando foi atualizado e o botão Atualizar recarrega', async () => {
    await mount('/');
    expect(text()).toContain('atualizado às 14:35');
    const btn = Array.from(document.querySelectorAll('button')).find(b => /Atualizar/.test(b.textContent ?? ''))!;
    await act(async () => { btn.click(); });
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it('período na URL é aplicado ao título dos gráficos', async () => {
    await mount('/?periodo=last_3_months');
    expect(text()).toContain('Últimos 3 meses');
  });
});
