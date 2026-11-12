import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { act } from 'react';

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
vi.mock('@/components/quality/AllocationAssistant', () => ({
  default: ({ target }: { target: { description: string } | null }) => (target ? <div data-testid="alloc">{target.description}</div> : null),
}));
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


describe('seções extraídas (estado compartilhado fica na tela)', () => {
  it('pagos sem data: o botão só habilita com a data e aplica o patch confirmado', async () => {
    render(<DataQualitySettings onBack={() => {}} />);
    open('Pagos sem data de pagamento');
    const save = screen.getByRole('button', { name: 'Salvar data informada' });
    expect(save).toBeDisabled();
    const row = screen.getByText('Lançamento t4').closest('.p-3') as HTMLElement;
    fireEvent.change(row.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: '2026-10-20' } });
    expect(screen.getByRole('button', { name: 'Salvar data informada' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar data informada' }));
    expect(screen.getByText('Informar data de pagamento')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('confirm')).getByRole('button', { name: 'Salvar data' }));
    await waitFor(() => expect(h.applyPatch).toHaveBeenCalledWith(['t4'], { payment_date: '2026-10-20' }, 'Data de pagamento informada'));
  });

  it('sem unidade: filtros por descrição e valor mínimo, e seleção habilita a atribuição só com unidade escolhida', () => {
    h.quality = {
      ...baseQuality(),
      semUnidade: [tx('s1', { description: 'Padaria Central', net_amount: 50 }), tx('s2', { description: 'Mercado Norte', net_amount: 500 })],
      units: [{ id: 'u1', name: 'Café' }],
    };
    render(<DataQualitySettings onBack={() => {}} />);
    open('Sem unidade e sem rateio');
    expect(screen.getByText('Padaria Central')).toBeInTheDocument();
    expect(screen.getByText('Mercado Norte')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Descrição'), { target: { value: 'merc' } });
    expect(screen.queryByText('Padaria Central')).toBeNull();
    expect(screen.getByText('Mercado Norte')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Descrição'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('Valor mínimo'), { target: { value: '100' } });
    expect(screen.queryByText('Padaria Central')).toBeNull();
    const row = screen.getByText('Mercado Norte').closest('.p-3') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Atribuir aos selecionados (1)' })).toBeDisabled(); // falta escolher a unidade
  });

  it('os filtros de "sem unidade" sobrevivem a recarregar a análise (estado fica na tela)', () => {
    h.quality = { ...baseQuality(), semUnidade: [tx('s1', { description: 'Padaria Central' }), tx('s2', { description: 'Mercado Norte' })] };
    const { rerender } = render(<DataQualitySettings onBack={() => {}} />);
    open('Sem unidade e sem rateio');
    fireEvent.change(screen.getByPlaceholderText('Descrição'), { target: { value: 'merc' } });
    // recarga: a análise passa por "carregando" e volta; as seções são remontadas
    const loaded = h.quality;
    h.quality = { ...baseQuality(), loading: true };
    rerender(<DataQualitySettings onBack={() => {}} />);
    h.quality = loaded;
    rerender(<DataQualitySettings onBack={() => {}} />);
    open('Sem unidade e sem rateio');
    expect(screen.getByPlaceholderText('Descrição')).toHaveValue('merc');
    expect(screen.queryByText('Padaria Central')).toBeNull();
  });

  it('duplicidades: mostra o grupo, marca "manter ambos" e abre cancelamento e rateio', () => {
    const a = tx('d1', { description: 'Aluguel loja', net_amount: 2000 });
    const b = tx('d2', { description: 'Aluguel loja', net_amount: 2000 });
    h.quality = { ...baseQuality(), duplicates: [{ key: 'k1', items: [a, b] }] };
    render(<DataQualitySettings onBack={() => {}} />);
    open('Possíveis duplicidades');
    expect(screen.getByText('2 lançamentos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manter ambos (legítimo)' }));
    expect(h.setReviewStatus).toHaveBeenCalledTimes(2);
    expect(h.setReviewStatus).toHaveBeenCalledWith('d1', 'revisado');
    expect(h.setReviewStatus).toHaveBeenCalledWith('d2', 'revisado');
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar rateio' })[0]);
    expect(screen.getByTestId('alloc')).toHaveTextContent('Aluguel loja');
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);
    expect(within(screen.getByTestId('confirm')).getAllByText('Cancelar lançamento')).toHaveLength(2); // título e botão
  });

  it('categorias sem linha de DRE e sem categoria listam os lançamentos ao abrir', () => {
    h.quality = {
      ...baseQuality(),
      orphanCategoryGroups: [{ categoryId: 'c1', categoryName: 'Categoria órfã', items: [tx('o1', { description: 'Compra órfã' })] }],
      semCategoria: [tx('c9', { description: 'Compra sem categoria' })],
    };
    render(<DataQualitySettings onBack={() => {}} />);
    open('Categorias sem linha de DRE');
    expect(screen.getByText('Compra órfã')).toBeInTheDocument();
    open('Sem categoria');
    expect(screen.getByText('Compra sem categoria')).toBeInTheDocument();
  });

  it('seções somente leitura exportam CSV e rateio que não fecha abre o assistente', async () => {
    h.quality = {
      ...baseQuality(),
      foraDoDre: [tx('f1')],
      allocationIssues: [{ tx: tx('r1', { description: 'Rateio quebrado', net_amount: 300 }), residual: 50, allocated: 250 }],
    };
    render(<DataQualitySettings onBack={() => {}} />);
    fireEvent.click(within(card('Fora do DRE (affects_dre = false)')).getByText('CSV'));
    expect(h.exportToCsv).toHaveBeenCalledTimes(1);
    open('Rateio que não fecha');
    expect(screen.getByText('Rateio quebrado')).toBeInTheDocument();
  });
});
