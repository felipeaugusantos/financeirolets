import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ calls: [] as { method: string; args: unknown[] }[], toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = () => {
    const proxy: unknown = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 });
        return (...args: unknown[]) => { h.calls.push({ method: prop, args }); return proxy; };
      },
    });
    return proxy;
  };
  return { supabase: { from: () => chain(), rpc: vi.fn() } };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
// toast precisa ter identidade estável: o hook o usa nas dependências do efeito de carga.
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));

import { useTransactions, type TransactionFilters } from '@/hooks/useTransactions';
import { filtersFromUrl } from '@/lib/transactionUrl';

let root: Root | null = null;
function Probe({ filters }: { filters: TransactionFilters }) { useTransactions(filters); return null; }
async function mount(filters: TransactionFilters) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Probe filters={filters} />); });
}
const used = (method: string, ...args: unknown[]) =>
  h.calls.some(c => c.method === method && args.every((a, i) => JSON.stringify(c.args[i]) === JSON.stringify(a)));

beforeAll(() => {
  const original = console.error;
  console.error = (...a: unknown[]) => { if (String(a[0]).includes('not wrapped in act')) return; original(...a); };
});
beforeEach(() => { root?.unmount(); root = null; document.body.innerHTML = ''; h.calls.length = 0; });

describe('Lançamentos: visão do Dashboard (regime)', () => {
  it('caixa: pagos que afetam o caixa, período pela data de pagamento', async () => {
    await mount({ type: 'receita', dateFrom: '2026-09-01', dateTo: '2026-09-30', regime: 'caixa' });
    expect(used('in', 'status', ['pago', 'recebido'])).toBe(true);
    expect(used('eq', 'affects_cashflow', true)).toBe(true);
    expect(used('gte', 'payment_date', '2026-09-01')).toBe(true);
    expect(used('lte', 'payment_date', '2026-09-30')).toBe(true);
    expect(used('gte', 'competence_date')).toBe(false);
  });

  it('dashboard: pagos por pagamento + provisionados por competência, numa só condição', async () => {
    await mount({ dateFrom: '2026-09-01', dateTo: '2026-09-30', regime: 'dashboard' });
    const or = h.calls.find(c => c.method === 'or' && String(c.args[0]).includes('affects_dre.eq.true'));
    expect(or).toBeTruthy();
    const q = String(or!.args[0]);
    expect(q).toContain('status.in.(pago,recebido),affects_cashflow.eq.true,payment_date.gte.2026-09-01,payment_date.lte.2026-09-30');
    expect(q).toContain('status.in.(pendente,agendado),affects_dre.eq.true,competence_date.gte.2026-09-01,competence_date.lte.2026-09-30');
    expect(used('gte', 'competence_date')).toBe(false);
  });

  it('sem regime o período segue pela competência, como sempre', async () => {
    await mount({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    expect(used('gte', 'competence_date', '2026-09-01')).toBe(true);
    expect(used('gte', 'payment_date')).toBe(false);
  });
});

describe('filtros de Lançamentos vindos da URL', () => {
  it('aceita só valores válidos', () => {
    const ok = filtersFromUrl(new URLSearchParams('type=despesa&status=pago&dateFrom=2026-09-01&dateTo=2026-09-30&regime=caixa&category_id=__null__'));
    expect(ok).toEqual({ type: 'despesa', status: 'pago', dateFrom: '2026-09-01', dateTo: '2026-09-30', regime: 'caixa', category_id: '__null__' });
    const bad = filtersFromUrl(new URLSearchParams('type=x&status=y&dateFrom=hoje&regime=z&unit_id=abc'));
    expect(bad).toEqual({});
  });
});
