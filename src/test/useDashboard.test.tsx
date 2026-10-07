import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = Record<string, unknown>;
interface Result { data: Row[] | null; error: { message: string } | null }

const h = vi.hoisted(() => ({
  /** Resposta por consulta: decide pelo nome da tabela e pelos métodos encadeados. */
  respond: null as null | ((table: string, calls: string[], range: [number, number] | null) => Promise<Result> | Result),
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain = (table: string) => {
    const calls: string[] = [];
    let range: [number, number] | null = null;
    const proxy: unknown = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve(h.respond!(table, calls, range)).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push(prop);
          if (prop === 'range') range = [args[0] as number, args[1] as number];
          return proxy;
        };
      },
    });
    return proxy;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});

import { useDashboard, type DashboardFilters } from '@/hooks/useDashboard';

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

const ok = (data: Row[]): Result => ({ data, error: null });
// Sem .range() o servidor devolve no máximo 1.000 linhas (limite padrão do Supabase), como em produção.
const page = (rows: Row[], range: [number, number] | null) => (range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, 1000));

// --- dados de teste (hoje = 15/09/2026) -----------------------------------------------------------
const t1 = { id: 't1', type: 'receita', net_amount: 1000, status: 'recebido', payment_date: '2026-09-10', competence_date: '2026-09-10', due_date: null, category_id: 'c1', unit_id: 'u1', front_id: null, affects_dre: true, affects_cashflow: true };
// despesa rateada 50/50 entre as unidades (sem unit_id no lançamento)
const t2 = { id: 't2', type: 'despesa', net_amount: 400, status: 'pago', payment_date: '2026-09-11', competence_date: '2026-09-11', due_date: null, category_id: 'c2', unit_id: null, front_id: null, affects_dre: true, affects_cashflow: true };
// transferência interna: não afeta o caixa
const t3 = { id: 't3', type: 'despesa', net_amount: 300, status: 'pago', payment_date: '2026-09-12', competence_date: '2026-09-12', due_date: null, category_id: 'c2', unit_id: 'u1', front_id: null, affects_dre: false, affects_cashflow: false };
// pendente vencida (dentro do período)
const t4 = { id: 't4', type: 'despesa', net_amount: 200, status: 'pendente', payment_date: null, competence_date: '2026-09-20', due_date: '2026-09-05', category_id: 'c2', unit_id: 'u2', front_id: null, affects_dre: true, affects_cashflow: true };
// pendente vencida há meses (fora do período do painel)
const t5 = { id: 't5', type: 'despesa', net_amount: 50, status: 'pendente', payment_date: null, competence_date: '2026-06-01', due_date: '2026-06-01', category_id: null, unit_id: 'u1', front_id: null, affects_dre: true, affects_cashflow: true };
const allocs = [
  { id: 'a1', transaction_id: 't2', unit_id: 'u1', front_id: null, allocation_type: 'percentual', percentage: 50, amount: null },
  { id: 'a2', transaction_id: 't2', unit_id: 'u2', front_id: null, allocation_type: 'percentual', percentage: 50, amount: null },
];

function normal(table: string, calls: string[], range: [number, number] | null): Result {
  if (table === 'transactions') {
    if (calls.includes('or')) return ok(page([t1, t2, t3, t4], range));            // período
    if (calls.includes('lte')) return ok([{ ...t4, partner: null }, { ...t5, partner: null }]); // alertas
    return ok(page([t1, t2], range));                                                // saldo (só afeta caixa)
  }
  if (table === 'transaction_allocations') return ok(page(allocs, range));
  if (table === 'accounts') return ok([{ id: 'acc', initial_balance: 5000, initial_balance_date: '2026-08-31' }]);
  if (table === 'categories') return ok([{ id: 'c1', name: 'Vendas' }, { id: 'c2', name: 'Aluguel' }]);
  if (table === 'units') return ok([{ id: 'u1', name: 'Café' }, { id: 'u2', name: 'Boulevard' }]);
  return ok([]);
}

// O estado do hook muda depois do act em refetchs; é ruído, não falha.
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
  h.respond = normal;
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { root?.unmount(); root = null; document.body.innerHTML = ''; vi.useRealTimers(); });

describe('useDashboard', () => {
  it('KPIs, saldo, ranking com rateio e contas em atraso batem com as regras', async () => {
    await render();
    await waitFor(() => expect(api.loading).toBe(false));
    expect(api.error).toBeNull();
    expect(api.receitasMes).toBe(1000);
    expect(api.despesasMes).toBe(400);                 // a transferência (não afeta caixa) fica de fora
    expect(api.saldoTotal).toBe(5000 + 1000 - 400);    // saldo inicial + movimento posterior à data-base
    // "Contas em Atraso" = a lista do aviso (inclui a vencida há meses, fora do período)
    expect(api.contasAtrasadas).toBe(2);
    expect(api.overdueBills.map(b => b.id)).toEqual(['t4', 't5']);
    // ranking: despesa rateada 50/50, transferência ignorada, pendente fora (sem "incluir provisionados")
    const byUnit = Object.fromEntries(api.unitRanking.map(u => [u.unitName, u]));
    expect(byUnit['Café']).toMatchObject({ despesas: 200, receitas: 1000 });
    expect(byUnit['Boulevard']).toMatchObject({ despesas: 200 });
    expect(byUnit['Sem unidade']).toBeUndefined();
  });

  it('lê todas as páginas: mais de 1.000 linhas não são truncadas', async () => {
    const many = Array.from({ length: 2300 }, (_, i) => ({ ...t1, id: `m${i}`, net_amount: 1 }));
    h.respond = (table, calls, range) =>
      table === 'transactions' && calls.includes('or') ? ok(page(many, range)) : normal(table, calls, range);
    await render();
    await waitFor(() => expect(api.loading).toBe(false));
    expect(api.receitasMes).toBe(2300);
  });

  it('consulta com erro mostra o aviso em vez de zeros silenciosos', async () => {
    h.respond = (table, calls, range) =>
      table === 'transactions' && calls.includes('or')
        ? { data: null, error: { message: 'timeout na consulta' } }
        : normal(table, calls, range);
    await render();
    await waitFor(() => expect(api.loading).toBe(false));
    expect(api.error).toContain('timeout na consulta');
  });

  it('falha ao recarregar mantém os números anteriores e avisa; tentar de novo recupera', async () => {
    await render();
    await waitFor(() => expect(api.loading).toBe(false));
    expect(api.receitasMes).toBe(1000);

    h.respond = (table, calls, range) =>
      table === 'accounts' ? { data: null, error: { message: 'sem conexão' } } : normal(table, calls, range);
    await act(async () => { api.reload(); });
    await waitFor(() => expect(api.error).toContain('sem conexão'));
    expect(api.receitasMes).toBe(1000);                // não virou zero
    expect(api.refreshing).toBe(false);

    h.respond = normal;
    await act(async () => { api.reload(); });
    await waitFor(() => expect(api.error).toBeNull());
    expect(api.receitasMes).toBe(1000);
  });

  it('resposta lenta de um filtro anterior não sobrescreve a do filtro atual', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    let periodCalls = 0;
    h.respond = async (table, calls, range) => {
      if (table === 'transactions' && calls.includes('or')) {
        periodCalls++;
        if (periodCalls === 1) {                       // 1ª busca (sem filtro): lenta, receita 1.000
          await gate;
          return ok(page([t1], range));
        }
        return ok(page([{ ...t1, id: 'fast', net_amount: 7, unit_id: 'u2' }], range)); // 2ª (unidade u2): rápida
      }
      return normal(table, calls, range);
    };
    await render();
    await render({ unitId: 'u2' });
    await waitFor(() => expect(api.receitasMes).toBe(7));
    await act(async () => { release(); await new Promise(r => setTimeout(r, 30)); });
    expect(api.receitasMes).toBe(7);                   // a resposta antiga foi descartada
  });
});
