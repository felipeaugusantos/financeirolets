import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UnlinkDialog from '@/components/ofx/UnlinkDialog';
import DeleteAllLinksDialog from '@/components/ofx/DeleteAllLinksDialog';
import IgnoreEntriesDialog from '@/components/ofx/IgnoreEntriesDialog';
import CreateFromStatementDialog from '@/components/ofx/CreateFromStatementDialog';
import { ReviewBadge } from '@/components/quality/ReviewBadge';
import { SimpleTable } from '@/components/quality/SimpleTable';
import { br, brl } from '@/components/ofx/ofxFormat';

const entry = (over = {}) => ({ id: 'e1', posted_at: '2026-10-05', amount: -150.5, memo: 'PIX FORNECEDOR', ...over });
const options = { categories: [{ id: 'c1', name: 'Insumos', type: 'despesa' }], units: [{ id: 'u1', name: 'Café' }], fronts: [], partners: [] };

describe('diálogos extraídos da conciliação OFX', () => {
  it('formatadores', () => {
    expect(br('2026-10-05')).toBe('05/10/2026');
    expect(brl(10)).toContain('10,00');
  });

  it('UnlinkDialog: mostra a linha e dispara as duas ações; fechado não renderiza', () => {
    const onUnlinkOnly = vi.fn(); const onUnlinkAndDelete = vi.fn(); const onClose = vi.fn();
    const { rerender } = render(<UnlinkDialog target={null} busy={false} onClose={onClose} onUnlinkOnly={onUnlinkOnly} onUnlinkAndDelete={onUnlinkAndDelete} />);
    expect(screen.queryByText('Desvincular conciliação')).toBeNull();
    rerender(<UnlinkDialog target={entry() as never} busy={false} onClose={onClose} onUnlinkOnly={onUnlinkOnly} onUnlinkAndDelete={onUnlinkAndDelete} />);
    expect(screen.getByText(/05\/10\/2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Só desvincular'));
    fireEvent.click(screen.getByText('Desvincular e excluir lançamento'));
    expect(onUnlinkOnly).toHaveBeenCalledTimes(1);
    expect(onUnlinkAndDelete).toHaveBeenCalledTimes(1);
  });

  it('UnlinkDialog: ocupado desabilita as ações', () => {
    render(<UnlinkDialog target={entry() as never} busy onClose={() => {}} onUnlinkOnly={() => {}} onUnlinkAndDelete={() => {}} />);
    expect(screen.getByText('Só desvincular')).toBeDisabled();
  });

  it('DeleteAllLinksDialog: informa a quantidade e confirma', () => {
    const onConfirm = vi.fn();
    render(<DeleteAllLinksDialog open onOpenChange={() => {}} linkedCount={7} busy={false} onConfirm={onConfirm} />);
    expect(screen.getByText(/7 linha\(s\) vinculada\(s\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Excluir conciliações'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('IgnoreEntriesDialog: justificativa obrigatória e atalhos preenchem o texto', () => {
    const onReasonChange = vi.fn(); const onConfirm = vi.fn();
    const items = [{ entry: entry() }] as never;
    const { rerender } = render(<IgnoreEntriesDialog open onOpenChange={() => {}} items={items} reason="" onReasonChange={onReasonChange} busy={false} onConfirm={onConfirm} />);
    expect(screen.getByText('Ignorar 1 linha(s)')).toBeInTheDocument();
    expect(screen.getByText('Ignorar com justificativa')).toBeDisabled();
    fireEvent.click(screen.getByText('Movimento não financeiro'));
    expect(onReasonChange).toHaveBeenCalledWith('Movimento não financeiro');
    rerender(<IgnoreEntriesDialog open onOpenChange={() => {}} items={items} reason="ok" onReasonChange={onReasonChange} busy={false} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Ignorar com justificativa'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('CreateFromStatementDialog: despesa paga, aviso de duplicidade e botão bloqueado por rateio inválido', () => {
    const onConfirm = vi.fn();
    const props = {
      createFor: { entry: entry(), ruleLabel: 'Regra X' } as never, onClose: () => {}, accountName: 'Bradesco',
      duplicateIds: new Set(['e1']), options, form: { description: 'PIX' }, onFormChange: () => {},
      split: false, onSplitChange: () => {}, splitRows: [], onSplitRowsChange: () => {}, busy: false, onConfirm,
    };
    const { rerender } = render(<CreateFromStatementDialog {...props} manualSplitValid />);
    expect(screen.getByText('despesa paga')).toBeInTheDocument();
    expect(screen.getByText('Bradesco')).toBeInTheDocument();
    expect(screen.getByText(/Já existe um lançamento com esta mesma descrição/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Criar e vincular'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    rerender(<CreateFromStatementDialog {...props} split manualSplitValid={false} />);
    expect(screen.getByText('Criar e vincular')).toBeDisabled();
  });
});

describe('componentes extraídos da conferência de qualidade', () => {
  it('SimpleTable: lista vazia e limite', () => {
    const { rerender } = render(<SimpleTable items={[]} />);
    expect(screen.getByText('Nenhum lançamento nesta condição.')).toBeInTheDocument();
    const items = Array.from({ length: 3 }, (_, i) => ({ id: `id-${i}xxxxxxxx`, competence_date: '2026-10-01', description: `D${i}`, type: 'despesa', status: 'pago', net_amount: 10 })) as never;
    rerender(<SimpleTable items={items} limit={2} />);
    expect(screen.getByText(/Mostrando 2 de 3/)).toBeInTheDocument();
  });

  it('ReviewBadge renderiza o status atual', () => {
    render(<ReviewBadge id="t1" value="revisado" onChange={() => {}} />);
    expect(screen.getAllByText(/Revisado/).length).toBeGreaterThan(0);
  });
});
