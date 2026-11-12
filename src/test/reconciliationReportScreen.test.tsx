import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Teste de caracterização do relatório de Reconciliação Dashboard ↔ DRE (já dividido em módulos).
const h = vi.hoisted(() => ({
  data: null as unknown,
  generate: vi.fn(async () => {}),
  fixTransaction: vi.fn(async () => true),
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'in']) b[m] = () => b;
    const rows: Record<string, unknown[]> = { units: [{ id: 'u1', name: 'Café' }], categories: [], business_fronts: [], audit_logs: [] };
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(res);
    return b;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});
vi.mock('@/hooks/useKaikinContext', () => ({ useKaikinContext: () => {} }));
vi.mock('@/hooks/useReconciliation', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useReconciliation')>()),
  useReconciliation: () => ({ data: h.data, loading: false, generate: h.generate, fixTransaction: h.fixTransaction, fixing: null }),
}));

import ReconciliationReport from '@/components/reports/ReconciliationReport';

const detail = (count = 0) => ({ total: count * 100, count, items: [], byCategory: [], byFront: [] });
const side = (v: number) => ({
  dashboard: v, dreCompetenciaRealizado: v, dreCompetenciaFull: v + 50, dreCaixa: v + 10, provisionado: 50,
  pagoForaDaCompetencia: 10, pagoDePeriodoAnterior: 20,
  rows: [
    { label: 'Dashboard (realizado)', value: v },
    { key: 'provisionado', label: 'Provisionado no período', value: 50 },
    { label: 'DRE Competência', value: v + 50, emphasis: 'total' },
  ],
  details: { provisionado: detail(1), pagoDePeriodoAnterior: detail(), pagoForaDaCompetencia: detail() },
  flags: { missingCategory: detail(), missingUnit: detail(), missingFront: detail(), provisionadoVencido: detail(), negativeOrZero: detail(), pagoSemData: detail() },
});
const data = () => ({
  receitas: side(1000), despesas: side(400),
  checklist: [
    { id: 'c1', severity: 'warn', title: 'Lançamentos sem unidade', message: '2 lançamentos sem unidade', count: 2, amount: 300, side: 'despesa' },
    { id: 'c2', severity: 'ok', title: 'Dashboard e DRE fecham', message: 'Tudo certo' },
  ],
});

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); h.data = null; });

describe('relatório Reconciliação Dashboard ↔ DRE', () => {
  it('mostra os filtros do mês atual e o aviso de movimentação calculada, sem resultados antes de gerar', () => {
    render(<ReconciliationReport onBack={() => {}} />);
    expect(screen.getByText('Reconciliação Dashboard ↔ DRE')).toBeInTheDocument();
    expect(screen.getByText(/Sem extrato bancário importado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar' })).toBeInTheDocument();
    expect(screen.queryByText(/Neste período seu/)).toBeNull();
  });

  it('Gerar chama o hook com o período e depois mostra os blocos do relatório', async () => {
    h.data = data();
    render(<ReconciliationReport onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar' }));
    await waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
    const arg = (h.generate.mock.calls[0] as unknown as [{ dateFrom: string; dateTo: string }])[0];
    expect(arg.dateFrom).toMatch(/^\d{4}-\d{2}-01$/);
    expect(arg.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(screen.getByText(/Neste período seu/)).toBeInTheDocument());
    expect(screen.getByText('Lançamentos sem unidade')).toBeInTheDocument();
  });

  it('o checklist conta as severidades e, por padrão, mostra só os itens que pedem atenção', async () => {
    h.data = data();
    render(<ReconciliationReport onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar' }));
    await waitFor(() => expect(screen.getByText('Lançamentos sem unidade')).toBeInTheDocument());
    expect(screen.getByText('1 atenção')).toBeInTheDocument();
    expect(screen.getByText('1 ok')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard e DRE fecham')).toBeNull();
    fireEvent.click(screen.getByLabelText('Só atenção'));
    expect(screen.getByText('Dashboard e DRE fecham')).toBeInTheDocument();
  });

  it('Voltar chama onBack', () => {
    const onBack = vi.fn();
    render(<ReconciliationReport onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
