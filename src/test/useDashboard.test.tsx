import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: h.rpc } }));

import { useDashboard, dashboardRpcError, type DashboardFilters } from '@/hooks/useDashboard';

type Api = ReturnType<typeof useDashboard>;
let api: Api;
let root: Root | null = null;

function Probe({ filters }: { filters?: DashboardFilters }) { api = useDashboard(filters); return null; }
const render = (filters?: DashboardFilters) => act(async () => { root!.render(<Probe filters={filters} />); });

async function waitFor(check: () => void, timeoutMs = 3000) {
  const start = Date.now();
  for (;;) {
    try { check(); return; } catch (e) {
      if (Date.now() - start > timeoutMs) throw e;
      await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    }
  }
}

/** Resposta de dashboard_summary, no formato que o PostgREST devolve (numeric como string ou número). */
const summary = (over: Record<string, unknown> = {}) => ({
  movimentacaoCalculada: '600.00', saldoInicialTotal: '5000.00', saldoInicialConfigurado: true,
  receitas: '1000.00', despesas: '400.00', receitasProvisionadas: '0', despesasProvisionadas: '200.00',
  prevReceitas: '700.00', prevDespesas: '0',
  semCategoria: 1, semCategoriaReceita: 0, semCategoriaDespesa: 1, semUnidade: 2,
  monthly: [{ month: '2026-09', receitas: '1000.00', despesas: '400.00', receitasProv: '0', despesasProv: '200.00' }],
  categoryData: [{ name: 'Aluguel', value: '400.00' }],
  receitaCategoryData: [{ name: 'Vendas', value: 1000 }],
  unitRanking: [{ unitId: 'u1', unitName: 'Café', despesas: '200.00', receitas: '1000.00' }],
  overdueBills: [{ id: 't5', description: 'Antiga', net_amount: '50.00', due_date: '2026-06-01', type: 'despesa', partner_name: null }],
  dueTodayBills: [{ id: 't9', description: 'Hoje', net_amount: '10.00', due_date: '2026-09-15', type: 'receita', partner_name: 'Cliente' }],
  ...over,
});

beforeAll(() => {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes('not wrapped in act')) return;
    original(...args);
  };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T12:00:00'));
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: summary(), error: null });
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { root?.unmount(); root = null; document.body.innerHTML = ''; vi.useRealTimers(); });

describe('useDashboard (resumo calculado no banco)', () => {
  it('converte a resposta em KPIs, saldo, variação, meses e avisos', async () => {
    await render();
    await waitFor(() => expect(api.loading).toBe(false));
    expect(api.error).toBeNull();
    expect(api.receitasMes).toBe(1000);
    expect(api.despesasMes).toBe(400);
    expect(api.saldoTotal).toBe(5600);                 // movimento + saldo inicial
    expect(api.saldoInicialConfigurado).toBe(true);
    expect(api.margemContribuicao).toBe(600);          // sem provisionados: 1000 - 400
    expect(api.variacaoReceita).toBeCloseTo(((1000 - 700) / 700) * 100);
    expect(api.variacaoDespesa).toBeNull();            // período anterior sem despesa
    expect(api.monthlyData).toEqual([{ label: 'Set/26', receitas: 1000, despesas: 400, receitasProv: 0, despesasProv: 200 }]);
    expect(api.categoryData).toEqual([{ name: 'Aluguel', value: 400 }]);
    expect(api.unitRanking[0]).toEqual({ unitId: 'u1', unitName: 'Café', despesas: 200, receitas: 1000 });
    expect(api.semCategoria).toBe(1);
    expect(api.semUnidade).toBe(2);
    expect(api.contasAtrasadas).toBe(1);               // = tamanho da lista do aviso
    expect(api.overdueBills[0]).toMatchObject({ id: 't5', net_amount: 50, partner_name: undefined });
    expect(api.vencendoHoje).toBe(1);
    expect(api.dueTodayBills[0].partner_name).toBe('Cliente');
  });

  it('com "incluir provisionados" a margem soma os provisionados', async () => {
    await render({ includeProvisioned: true });
    await waitFor(() => expect(api.loading).toBe(false));
    expect(api.margemContribuicao).toBe(1000 - (400 + 200));
  });

  it('envia ao banco o período, os filtros e o "hoje" local', async () => {
    await render({ unitId: 'u1', frontId: 'f1', includeProvisioned: true, period: { from: '2026-08-01', to: '2026-09-30' } });
    await waitFor(() => expect(api.loading).toBe(false));
    expect(h.rpc).toHaveBeenCalledWith('dashboard_summary', {
      p_from: '2026-08-01', p_to: '2026-09-30', p_unit: 'u1', p_front: 'f1', p_include_provisioned: true, p_today: '2026-09-15',
    });
    h.rpc.mockClear();
    await render();                                    // sem filtros: mês atual, nulos
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(h.rpc.mock.calls[0][1]).toMatchObject({ p_from: '2026-09-01', p_to: '2026-09-30', p_unit: null, p_front: null, p_include_provisioned: false });
  });

  it('erro do banco mostra o aviso em vez de zeros silenciosos', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'timeout na consulta' } });
    await render();
    await waitFor(() => expect(api.loading).toBe(false));
    expect(api.error).toContain('timeout na consulta');
  });

  it('falha ao recarregar mantém os números anteriores e avisa; tentar de novo recupera', async () => {
    await render();
    await waitFor(() => expect(api.loading).toBe(false));
    h.rpc.mockResolvedValue({ data: null, error: { message: 'sem conexão' } });
    await act(async () => { api.reload(); });
    await waitFor(() => expect(api.error).toContain('sem conexão'));
    expect(api.receitasMes).toBe(1000);                // não virou zero
    expect(api.refreshing).toBe(false);
    h.rpc.mockResolvedValue({ data: summary(), error: null });
    await act(async () => { api.reload(); });
    await waitFor(() => expect(api.error).toBeNull());
  });

  it('função ausente no banco orienta a aplicar a migração', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await render();
    await waitFor(() => expect(api.loading).toBe(false));
    expect(api.error).toMatch(/20261008120000/);
    expect(dashboardRpcError({ message: 'invalid_period: x' })).toMatch(/Período inválido/);
  });

  it('resposta lenta de um filtro anterior não sobrescreve a do filtro atual', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    h.rpc.mockReset();
    h.rpc
      .mockImplementationOnce(async () => { await gate; return { data: summary({ receitas: '1000.00' }), error: null }; })
      .mockImplementation(async () => ({ data: summary({ receitas: '7.00' }), error: null }));
    await render();
    await render({ unitId: 'u2' });
    await waitFor(() => expect(api.receitasMes).toBe(7));
    await act(async () => { release(); await new Promise(r => setTimeout(r, 30)); });
    expect(api.receitasMes).toBe(7);                   // a resposta antiga foi descartada
  });
});
