import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  toast: vi.fn(),
  fromCalls: [] as { table: string; method: string }[],
}));

// Cadeia permissiva: qualquer método devolve a própria cadeia; aguardá-la resolve uma lista vazia.
vi.mock('@/integrations/supabase/client', () => {
  const chain = (table: string) => {
    const proxy: unknown = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 });
        return (..._args: unknown[]) => { h.fromCalls.push({ table, method: prop }); return proxy; };
      },
    });
    return proxy;
  };
  return { supabase: { from: (t: string) => chain(t), rpc: h.rpc, storage: { from: () => ({ upload: vi.fn() }) } } };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));

import { useTransactions, type TransactionInput } from '@/hooks/useTransactions';
import { transactionRpcError } from '@/lib/rpc';

type Api = ReturnType<typeof useTransactions>;
let api: Api;
let root: Root | null = null;

function Probe() { api = useTransactions({}); return null; }

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Probe />); });
}

const base: TransactionInput = {
  type: 'despesa', description: 'Aluguel', amount: 300, tax_amount: 0, competence_date: '2026-09-10',
  due_date: '2026-09-10', status: 'pendente',
};

// O estado do hook muda depois do act em refetchs; é ruído, não falha.
beforeAll(() => {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes('not wrapped in act')) return;
    original(...args);
  };
});

beforeEach(async () => {
  root?.unmount();
  root = null;
  document.body.innerHTML = '';
  h.rpc.mockReset();
  h.toast.mockReset();
  h.fromCalls.length = 0;
  await mount();
  h.fromCalls.length = 0;
});

describe('salvar e excluir lançamento (funções atômicas)', () => {
  it('criar em 3 parcelas manda tudo numa chamada, com o rateio em R$ dividido por parcela', async () => {
    h.rpc.mockResolvedValue({ data: ['t1', 't2', 't3'], error: null });
    let ok = false;
    await act(async () => {
      ok = await api.create({
        ...base, is_installment: true, installment_count: 3,
        allocations: [{ unit_id: 'u1', allocation_type: 'valor', amount: 90 }, { unit_id: '__none__', allocation_type: 'percentual', percentage: 50 }],
      });
    });
    expect(ok).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = h.rpc.mock.calls[0];
    expect(fn).toBe('create_transactions_with_allocations');
    expect(args.p_rows).toHaveLength(3);
    expect(args.p_rows.map((r: { installment_number: number }) => r.installment_number)).toEqual([1, 2, 3]);
    expect(args.p_allocations).toEqual([
      { unit_id: 'u1', front_id: null, allocation_type: 'valor', percentage: null, amount: 30 },
      { unit_id: null, front_id: null, allocation_type: 'percentual', percentage: 50, amount: null },
    ]);
    // nada é gravado direto nas tabelas (era o que deixava lançamento sem rateio)
    expect(h.fromCalls.filter(c => ['insert', 'update', 'delete'].includes(c.method))).toEqual([]);
  });

  it('criar com erro do banco não deixa nada e avisa', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'Mês 09/2026 está fechado.' } });
    let ok = true;
    await act(async () => { ok = await api.create(base); });
    expect(ok).toBe(false);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao criar lançamento', description: 'Mês 09/2026 está fechado.' }));
  });

  it('editar manda só os campos alterados; sem rateio novo não manda p_allocations', async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    await act(async () => { await api.update('t1', { description: 'Novo', amount: 200, tax_amount: 0 }); });
    const [fn, args] = h.rpc.mock.calls[0];
    expect(fn).toBe('update_transaction_with_allocations');
    expect(args.p_id).toBe('t1');
    expect(args.p_patch).toEqual({ description: 'Novo', amount: 200, tax_amount: 0, net_amount: 200 });
    expect('p_allocations' in args).toBe(false);
    expect(h.fromCalls.filter(c => c.table === 'transaction_allocations')).toEqual([]);
  });

  it('editar com rateio manda a lista (vazia remove o rateio)', async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    await act(async () => { await api.update('t1', { notes: 'x', allocations: [] }); });
    expect(h.rpc.mock.calls[0][1].p_allocations).toEqual([]);
    await act(async () => { await api.update('t1', { allocations: [{ unit_id: 'u1', allocation_type: 'percentual', percentage: 100 }] }); });
    expect(h.rpc.mock.calls[1][1].p_allocations).toEqual([
      { unit_id: 'u1', front_id: null, allocation_type: 'percentual', percentage: 100, amount: null },
    ]);
  });

  it('editar sem permissão mostra mensagem clara e devolve false', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'transaction_not_found: lançamento inexistente ou sem permissão' } });
    let ok = true;
    await act(async () => { ok = await api.update('t1', { notes: 'x' }); });
    expect(ok).toBe(false);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Lançamento não encontrado ou sem permissão. Atualize a tela.' }));
  });

  it('excluir usa uma chamada, devolve o que foi removido e não apaga anexos pelo navegador', async () => {
    const row = { id: 't1', description: 'Aluguel' };
    h.rpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'delete_transaction_with_children'
        ? { data: { row, allocations: [{ id: 'a1' }], attachments: [{ id: 'f1' }] }, error: null }
        : { data: null, error: null }));
    let captured: unknown = null;
    await act(async () => { captured = await api.remove('t1'); });
    expect(captured).toEqual({ row, allocations: [{ id: 'a1' }] });
    expect(h.rpc.mock.calls[0]).toEqual(['delete_transaction_with_children', { p_id: 't1' }]);
    expect(h.fromCalls.filter(c => c.table === 'attachments')).toEqual([]);
    // a auditoria continua sendo gravada
    expect(h.rpc.mock.calls.some(c => c[0] === 'log_transaction_action')).toBe(true);
  });

  it('excluir em mês fechado: o banco recusa, nada é perdido e a tela volta', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'Mês 09/2026 está fechado. Reabra o período para alterar lançamentos.' } });
    let captured: unknown = 'x';
    await act(async () => { captured = await api.remove('t1'); });
    expect(captured).toBeNull();
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao excluir' }));
    expect(h.fromCalls.filter(c => c.table === 'attachments')).toEqual([]);
  });
});

describe('transactionRpcError', () => {
  it('orienta a aplicar a migração quando a função não existe no banco', () => {
    expect(transactionRpcError('delete_transaction_with_children', { code: 'PGRST202', message: 'x' }))
      .toMatch(/20261006120000/);
  });
});
