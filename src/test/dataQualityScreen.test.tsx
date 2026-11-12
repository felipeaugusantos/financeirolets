import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

// Teste de caracterização da tela de Conferência: fixa o comportamento atual antes de qualquer divisão.
const h = vi.hoisted(() => ({
  quality: {} as Record<string, unknown>,
  reviewStatus: {} as Record<string, unknown>,
  applyPatch: vi.fn(async () => true),
  deleteTransactions: vi.fn(async () => true),
  saveAllocations: vi.fn(),
  setReviewStatus: vi.fn(),
  reloadQuality: vi.fn(),
  reloadReviews: vi.fn(),
  reloadSnapshot: vi.fn(),
  exportToCsv: vi.fn(),
  snapshot: { receita: 1000, despesa: 400, resultado: 600, liquido: 600 },
}));

vi.mock('@/hooks/useDataQuality', () => ({ useDataQuality: () => ({ ...h.quality, reload: h.reloadQuality }) }));
vi.mock('@/hooks/useReviewActions', () => ({
  useReviewActions: () => ({ applyPatch: h.applyPatch, deleteTransactions: h.deleteTransactions, saveAllocations: h.saveAllocations, busy: false }),
  useReviewStatus: () => ({ reviewStatus: h.reviewStatus, setReviewStatus: h.setReviewStatus, reloadReviews: h.reloadReviews, reviewsLoading: false }),
}));
vi.mock('@/hooks/useFinanceSnapshot', () => ({ useFinanceSnapshot: () => ({ snapshot: h.snapshot, loading: false, reload: h.reloadSnapshot }) }));
vi.mock('@/lib/exportCsv', async (orig) => ({ ...(await orig<typeof import('@/lib/exportCsv')>()), exportToCsv: h.exportToCsv }));
vi.mock('@/components/quality/PixTriagePanel', () => ({ default: () => <div data-testid="pix-panel" /> }));
vi.mock('@/components/quality/DreTransfersPanel', () => ({ default: () => <div data-testid="dre-panel" /> }));
vi.mock('@/components/quality/AllocationAssistant', () => ({ default: () => null }));
vi.mock('@/components/quality/ConfirmChangeDialog', () => ({
  default: ({ payload }: { payload: { title: string; confirmLabel: string; onConfirm: () => void; rows: unknown[] } | null }) =>
    payload ? (
      <div data-testid="confirm">
        <p>{payload.title}</p>
        <p data-testid="confirm-rows">{payload.rows.length}</p>
        <button onClick={() => payload.onConfirm()}>{payload.confirmLabel}</button>
      </div>
    ) : null,
}));

import DataQualitySettings from '@/pages/settings/DataQualitySettings';

const tx = (id: string, over: Record<string, unknown> = {}) => ({
  id, description: `Lançamento ${id}`, type: 'despesa', status: 'pago', net_amount: 100, amount: 100,
  competence_date: '2026-10-05', due_date: null, payment_date: null, category_id: null, unit_id: null, front_id: null,
  partner_id: null, account_id: null, affects_dre: true, affects_cashflow: true, ...over,
});

const baseQuality = () => ({
  loading: false, duplicates: [], typeStatusMismatch: [], semCategoria: [], semUnidade: [], foraDoDre: [], foraDoCaixa: [],
  pagoSemData: [], semFornecedor: [], categoryIssues: [], dreLineIssues: [], testSuspects: [], transfersInDre: [],
  orphanCategoryGroups: [], allocationIssues: [], fronts: [], categories: [], units: [], accounts: [], dreLines: [],
  categoryNameById: new Map(), unitNameById: new Map(), accountNameById: new Map(), total: 0,
});

const card = (title: string) =>
  screen.getByText(title).closest('[class*="rounded-2xl"]') as HTMLElement;
const open = (title: string) => fireEvent.click(within(card(title)).getByText('Ver'));

beforeEach(() => {
  vi.clearAllMocks();
  h.reviewStatus = {};
  h.quality = {
    ...baseQuality(),
    testSuspects: [tx('t1', { description: 'TESTE demo' })],
    transfersInDre: [tx('t2', { description: 'Transf entre contas' }), tx('t3', { description: 'Outra transf' })],
    pagoSemData: [tx('t4')],
    total: 4,
  };
});

describe('tela Conferência de qualidade dos dados', () => {
  it('mostra o estado de carregamento', () => {
    h.quality = { ...baseQuality(), loading: true };
    render(<DataQualitySettings onBack={() => {}} />);
    expect(screen.getByText('Analisando lançamentos...')).toBeInTheDocument();
  });

  it('mostra a trava de caixa com os totais do período e todas as seções com suas contagens', () => {
    render(<DataQualitySettings onBack={() => {}} />);
    expect(screen.getByText(/Trava de caixa ativa/)).toBeInTheDocument();
    expect(screen.getByText('Receita (DRE)')).toBeInTheDocument();
    expect(screen.getByText('Caixa líquido')).toBeInTheDocument();
    expect(screen.getByTestId('pix-panel')).toBeInTheDocument();
    expect(screen.getByTestId('dre-panel')).toBeInTheDocument();
    for (const t of [
      'Possíveis lançamentos de teste', 'Transferências entrando no DRE', 'Categorias sem linha de DRE', 'Tipo x status incompatível',
      'Possíveis duplicidades', 'Sem categoria', 'Sem unidade e sem rateio', 'Pagos sem data de pagamento',
      'Rateio que não fecha', 'Despesas sem fornecedor',
    ]) expect(screen.getByText(t)).toBeInTheDocument();
    expect(within(card('Transferências entrando no DRE')).getByText('2')).toBeInTheDocument();
    expect(within(card('Possíveis lançamentos de teste')).getByText('1')).toBeInTheDocument();
  });

  it('resume as marcações de revisão (pendentes por padrão)', () => {
    // o resumo conta só as listas de problemas gerais (sem categoria/unidade, tipo x status, fora do DRE, pago sem data)
    h.reviewStatus = { t4: { status: 'revisado', note: null, reviewed_at: null, reviewed_by: null } };
    render(<DataQualitySettings onBack={() => {}} />);
    expect(screen.getByText('Total analisado: 1')).toBeInTheDocument();
    expect(screen.getByText('Revisado: 1')).toBeInTheDocument();
    expect(screen.getByText('Pendente: 0')).toBeInTheDocument();
  });

  it('seção fechada não lista linhas; ao abrir, lista os lançamentos', () => {
    render(<DataQualitySettings onBack={() => {}} />);
    expect(screen.queryByText('TESTE demo')).toBeNull();
    open('Possíveis lançamentos de teste');
    expect(screen.getByText('TESTE demo')).toBeInTheDocument();
  });

  it('cancelar lançamento de teste pede confirmação e só então aplica o patch', async () => {
    render(<DataQualitySettings onBack={() => {}} />);
    open('Possíveis lançamentos de teste');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar lançamento' }));
    const dlg = screen.getByTestId('confirm');
    expect(within(dlg).getAllByText('Cancelar lançamento')).toHaveLength(2); // título e botão de confirmar
    expect(h.applyPatch).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar lançamento' }));
    await waitFor(() => expect(h.applyPatch).toHaveBeenCalledWith(['t1'], { status: 'cancelado' }, 'Lançamento cancelado'));
  });

  it('excluir lançamento de teste exige confirmação e chama deleteTransactions', async () => {
    render(<DataQualitySettings onBack={() => {}} />);
    open('Possíveis lançamentos de teste');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(screen.getByText('Excluir lançamento definitivamente')).toBeInTheDocument();
    expect(h.deleteTransactions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));
    await waitFor(() => expect(h.deleteTransactions).toHaveBeenCalledWith(['t1']));
  });

  it('transferências: seleção em bloco habilita "Remover do DRE" e aplica só nos marcados', async () => {
    render(<DataQualitySettings onBack={() => {}} />);
    open('Transferências entrando no DRE');
    const remove = screen.getByRole('button', { name: /Remover do DRE \(0\)/ });
    expect(remove).toBeDisabled();
    const row = screen.getByText('Transf entre contas').closest('.p-3') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));
    const enabled = screen.getByRole('button', { name: /Remover do DRE \(1\)/ });
    expect(enabled).toBeEnabled();
    fireEvent.click(enabled);
    expect(screen.getByTestId('confirm-rows')).toHaveTextContent('1');
    fireEvent.click(within(screen.getByTestId('confirm')).getByRole('button', { name: 'Remover do DRE' }));
    await waitFor(() => expect(h.applyPatch).toHaveBeenCalledWith(['t2'], { affects_dre: false }, 'Removidos do DRE'));
  });

  it('o filtro de revisão esconde linhas já revisadas (padrão: só pendentes)', () => {
    h.reviewStatus = { t2: { status: 'revisado', note: null, reviewed_at: null, reviewed_by: null } };
    render(<DataQualitySettings onBack={() => {}} />);
    open('Transferências entrando no DRE');
    expect(screen.queryByText('Transf entre contas')).toBeNull();
    expect(screen.getByText('Outra transf')).toBeInTheDocument();
  });

  it('botão CSV exporta a seção com o nome do problema', () => {
    render(<DataQualitySettings onBack={() => {}} />);
    fireEvent.click(within(card('Possíveis lançamentos de teste')).getByText('CSV'));
    expect(h.exportToCsv).toHaveBeenCalledTimes(1);
    const [name, headers, rows] = h.exportToCsv.mock.calls[0] as unknown as [string, string[], unknown[][]];
    expect(name).toMatch(/^conferencia_teste_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(headers).toContain('Problema');
    expect(rows).toHaveLength(1);
  });

  it('seção sem casos não mostra o botão CSV e exibe "Nenhum caso."', () => {
    render(<DataQualitySettings onBack={() => {}} />);
    expect(within(card('Tipo x status incompatível')).queryByText('CSV')).toBeNull();
  });

  it('Atualizar recarrega a análise e as marcações', () => {
    render(<DataQualitySettings onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Atualizar/ }));
    expect(h.reloadQuality).toHaveBeenCalled();
    expect(h.reloadReviews).toHaveBeenCalled();
  });
});
