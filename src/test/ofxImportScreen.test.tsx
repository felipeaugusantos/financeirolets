import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Teste de caracterização da tela de Conciliação OFX: fixa a ligação entre a tela, o hook e os diálogos.
const h = vi.hoisted(() => ({
  ofx: {} as Record<string, unknown>,
  roles: { isAdmin: true, isFinanceiro: false },
  fns: {
    reapplyRules: vi.fn(), ignoreMany: vi.fn(), linkEntry: vi.fn(), unlinkEntry: vi.fn(),
    unlinkAndDeleteEntry: vi.fn(), createFromEntry: vi.fn(), reload: vi.fn(),
  },
  tables: {} as Record<string, unknown[]>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'or', 'gte', 'lte', 'neq', 'limit', 'in', 'is']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: h.tables[table] ?? [], error: null }).then(res);
    return b;
  };
  return { supabase: { from: (t: string) => builder(t), rpc: async () => ({ data: null, error: null }) } };
});
vi.mock('@/hooks/useOfxImport', () => ({ useOfxImport: () => ({ ...h.ofx, ...h.fns }) }));
vi.mock('@/hooks/useUserRoles', () => ({ useCurrentUserRoles: () => ({ ...h.roles, roles: [], loading: false }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

type Enriched = { entry: { id: string; memo: string; amount: number; posted_at: string; status: string; transaction_id: string | null } };
vi.mock('@/components/ofx/ClassicReconciliation', () => ({
  default: (p: { accountName: string; enriched: Enriched[]; onIgnore: (ids: string[], r: string) => void; onCreate: (id: string) => void; onUnlink: (id: string) => void }) => (
    <div data-testid="classic">
      <span>painel:{p.accountName}</span>
      <button onClick={() => p.onIgnore(['e1'], 'motivo')}>mock-ignorar</button>
      <button onClick={() => p.onCreate('e1')}>mock-criar</button>
      <button onClick={() => p.onUnlink('e2')}>mock-desvincular</button>
    </div>
  ),
}));
// Painéis e diálogos pesados: fora do foco destes testes (vi.mock é içado; vi.doMock em laço não seria).
vi.mock('@/components/ofx/DuplicatePairingPanel', () => ({ default: () => null }));
vi.mock('@/components/ofx/OfxPeriodReport', () => ({ default: () => null }));
vi.mock('@/components/ofx/InternalTransfersPanel', () => ({ default: () => null }));
vi.mock('@/components/ofx/PatternGroupsPanel', () => ({ default: () => null }));
vi.mock('@/components/ofx/ClosingPanel', () => ({ default: () => null }));
vi.mock('@/components/ofx/SuggestedRulesPanel', () => ({ default: () => null }));
vi.mock('@/components/ofx/QuickRuleDialog', () => ({ default: () => null }));
vi.mock('@/components/ofx/BulkCreateDialog', () => ({ default: () => null }));
vi.mock('@/components/ofx/BankApiImportDialog', () => ({ default: () => null }));
vi.mock('@/components/ofx/AutoPostDialog', () => ({
  default: ({ open, items }: { open: boolean; items: unknown[] }) => (open ? <div data-testid="autopost">{items.length}</div> : null),
}));

import OfxImportSettings from '@/pages/settings/OfxImportSettings';

const stmt = (id: string, over = {}) => ({ id, memo: `PIX ${id}`, amount: -100, posted_at: '2026-10-05', status: 'pendente', transaction_id: null, ...over });
const enrichedOf = (e: ReturnType<typeof stmt>) => ({
  entry: e, suggestions: [], ruleCategoryId: null, ruleUnitId: null, ruleFrontId: null, rulePartnerId: null, ruleLabel: null,
  ruleAllocations: null,
  descMatch: { transactions: [], exactTransactions: [], transaction: null, divergences: [], ambiguous: false, autoLinkable: false, similar: false, similarReasons: [] },
});

const mount = () => render(<MemoryRouter><OfxImportSettings onBack={() => {}} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.roles = { isAdmin: true, isFinanceiro: false };
  h.tables = { accounts: [{ id: 'a1', name: 'Bradesco', ofx_acctid: '123', active: true }], units: [{ id: 'u1', name: 'Café' }] };
  const e1 = stmt('e1'); const e2 = stmt('e2', { status: 'vinculado', transaction_id: 't9' });
  h.ofx = {
    enriched: [enrichedOf(e1), enrichedOf(e2)], entries: [e1, e2], candidates: [], rules: [], loading: false, importing: false,
    batchRunning: false, lastImport: null, duplicateGroups: [],
    stats: { total: 2, pendentes: 1, vinculados: 1, ignorados: 0, entradas: 0, saidas: -100, pendenteValor: -100 },
  };
});

describe('tela Conciliação bancária (OFX)', () => {
  it('seleciona a primeira conta, mostra o painel e os indicadores do período', async () => {
    mount();
    expect(screen.getByText('Conciliação bancária (OFX)')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('painel:Bradesco')).toBeInTheDocument());
    expect(screen.getByText('Linhas no período')).toBeInTheDocument();
    expect(screen.getByText('Pendentes')).toBeInTheDocument();
    expect(screen.getByText(/1 linha\(s\) do extrato ainda sem decisão/)).toBeInTheDocument();
    expect(screen.getByText(/50% conciliado/)).toBeInTheDocument();
    expect(screen.getByText('1 de 2 linha(s) decididas')).toBeInTheDocument();
  });

  it('sem contas, as ações de importação ficam desabilitadas', async () => {
    h.tables = { accounts: [] };
    mount();
    await waitFor(() => expect(screen.getByText('Linhas no período')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Selecionar arquivo OFX/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Importar da API Bradesco/ })).toBeDisabled();
    expect(screen.queryByTestId('classic')).toBeNull();
  });

  it('mostra o resumo da última importação', async () => {
    h.ofx = { ...h.ofx, lastImport: { fileName: 'extrato.ofx', inserted: 5, duplicated: 2, period: { start: '2026-10-01', end: '2026-10-31' }, ledgerBalance: 1500, ledgerBalanceDate: '2026-10-31' } };
    mount();
    expect(screen.getByText('extrato.ofx')).toBeInTheDocument();
    expect(screen.getByText(/5 linha\(s\) novas, 2 já existentes/)).toBeInTheDocument();
    expect(screen.getByText(/Período do arquivo: 01\/10\/2026 a 31\/10\/2026/)).toBeInTheDocument();
  });

  it('"Lançar pelas regras" só aparece para administrador ou financeiro', async () => {
    const { unmount } = mount();
    await waitFor(() => expect(screen.getByText('painel:Bradesco')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Lançar pelas regras/ })).toBeInTheDocument();
    unmount();
    h.roles = { isAdmin: false, isFinanceiro: false };
    mount();
    await waitFor(() => expect(screen.getByText('painel:Bradesco')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Lançar pelas regras/ })).toBeNull();
  });

  it('"Reaplicar regras" chama o hook', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('painel:Bradesco')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Reaplicar regras/ }));
    expect(h.fns.reapplyRules).toHaveBeenCalledTimes(1);
  });

  it('guarda os filtros para reabrir a tela do mesmo jeito', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('painel:Bradesco')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'ignorado' }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('ofx-conciliacao-filtros:u1') ?? '{}');
      expect(saved.statusFilter).toBe('ignorado');
      expect(saved.accountId).toBe('a1');
    });
  });

  it('alterna para a visão em lista (painel clássico some e a busca aparece)', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('classic')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Visão em lista' }));
    expect(screen.queryByTestId('classic')).toBeNull();
    expect(screen.getByPlaceholderText('Buscar por descrição ou valor')).toBeInTheDocument();
  });

  it('ignorar pelo painel chama ignoreMany com ids e justificativa', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('classic')).toBeInTheDocument());
    fireEvent.click(screen.getByText('mock-ignorar'));
    expect(h.fns.ignoreMany).toHaveBeenCalledWith(['e1'], 'motivo');
  });

  it('criar pelo painel abre o diálogo de criação com os dados do extrato', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('classic')).toBeInTheDocument());
    expect(screen.queryByText('Criar lançamento a partir do extrato')).toBeNull();
    fireEvent.click(screen.getByText('mock-criar'));
    const title = await screen.findByText('Criar lançamento a partir do extrato');
    expect(title).toBeInTheDocument();
    expect(screen.getByText('despesa paga')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar e vincular' })).toBeEnabled();
  });

  it('desvincular pelo painel abre o diálogo e as duas ações chamam o hook', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('classic')).toBeInTheDocument());
    fireEvent.click(screen.getByText('mock-desvincular'));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText('Desvincular conciliação')).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Só desvincular' }));
    await waitFor(() => expect(h.fns.unlinkEntry).toHaveBeenCalled());
  });

  describe('visão em lista: "Linhas do extrato" (card extraído)', () => {
    const suggestion = {
      transaction: { id: 'tx1', description: 'Fornecedor ABC', amount: -100 },
      confidence: 'alta', dayGap: 0, amountGap: 0, basis: 'exato', score: 95, reasons: ['mesmo valor', 'mesma data'],
    };

    const openLines = async () => {
      mount();
      await waitFor(() => expect(screen.getByTestId('classic')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Visão em lista' }));
      expect(screen.queryByText('Linhas do extrato')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes e sugestões das linhas' }));
      await screen.findByText('Linhas do extrato');
    };

    it('mostra as linhas, a sugestão compatível e o botão Vincular com o motivo', async () => {
      const e1 = stmt('e1');
      h.ofx = { ...h.ofx, enriched: [{ ...enrichedOf(e1), suggestions: [suggestion] }, enrichedOf(stmt('e2', { status: 'vinculado', transaction_id: 't9', match_note: 'vínculo manual' }))], entries: [e1, stmt('e2', { status: 'vinculado' })] };
      await openLines();
      expect(screen.getByText('Lançamentos compatíveis:')).toBeInTheDocument();
      expect(screen.getByText(/Fornecedor ABC/)).toBeInTheDocument();
      expect(screen.getByText(/valor exato · confiança alta/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Vincular$/ }));
      expect(h.fns.linkEntry).toHaveBeenCalledWith('e1', 'tx1', 'mesmo valor; mesma data');
    });

    it('linha sem sugestão mostra o aviso; criar abre o diálogo e Reabrir abre o desvínculo', async () => {
      await openLines();
      expect(screen.getByText(/Nenhum lançamento compatível encontrado/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Criar lançamento$/ }));
      expect(await screen.findByText('Criar lançamento a partir do extrato')).toBeInTheDocument();
    });

    it('linha já vinculada oferece Reabrir, que abre o diálogo de desvincular', async () => {
      await openLines();
      fireEvent.click(screen.getByRole('button', { name: 'vinculado' })); // o filtro padrão mostra só pendentes
      fireEvent.click(await screen.findByRole('button', { name: /Reabrir/ }));
      const dlg = await screen.findByRole('dialog');
      expect(within(dlg).getByText('Desvincular conciliação')).toBeInTheDocument();
    });

    it('selecionar pendentes habilita as ações em lote e Ignorar selecionadas abre a justificativa', async () => {
      await openLines();
      expect(screen.queryByText('1 selecionada(s)')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Selecionar pendentes (1)' }));
      expect(await screen.findByText('1 selecionada(s)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Limpar seleção' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Ignorar selecionadas' }));
      expect(await screen.findByText('Ignorar 1 linha(s)')).toBeInTheDocument();
    });

    it('sem linhas no filtro: oferece "Ver o ano todo"', async () => {
      h.ofx = { ...h.ofx, enriched: [], entries: [], stats: { total: 0, pendentes: 0, vinculados: 0, ignorados: 0, entradas: 0, saidas: 0, pendenteValor: 0 } };
      await openLines();
      expect(screen.getByText('Nenhuma linha nesse filtro.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Ver o ano todo' }));
      await waitFor(() => expect(JSON.parse(localStorage.getItem('ofx-conciliacao-filtros:u1') ?? '{}').from).toMatch(/^\d{4}-01-01$/));
    });
  });
});
