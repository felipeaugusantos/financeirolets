import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { Tables } from '@/integrations/supabase/types';

const h = vi.hoisted(() => ({ filters: vi.fn(), form: vi.fn() }));
vi.mock('@/hooks/useTransactions', () => ({ useTransactions: (filters: unknown) => {
  h.filters(filters);
  return { data: [], loading: false, totals: { receitas: 0, despesas: 0, saldo: 0 }, listComplete: true };
} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useDeleteHistory', () => ({ useDeleteHistory: () => ({ undoStack: [], redoStack: [] }) }));
vi.mock('@/components/transactions/TransactionFormDialog', () => ({ default: (props: unknown) => { h.form(props); return null; } }));
vi.mock('@/components/transactions/TransactionList', () => ({ default: () => null }));
vi.mock('@/components/transactions/CardSaleDialog', () => ({ default: () => null }));
vi.mock('@/components/transactions/TransactionFilters', () => ({ default: ({ onChange }: { onChange: (v: object) => void }) => <button onClick={() => onChange({})}>Clear</button> }));
import Transactions from '@/pages/Transactions';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('Categorias contábeis na tela de lançamentos', () => {
  for (const [name, id] of [
    ['Depreciação', '0046d82e-5aca-4ae8-89ce-a7a58de9bb6c'],
    ['CSLL', '02b0c6d7-5db7-4e43-a112-20821647e8e2'],
  ]) {
    it(`${name}: mantém o escopo ao limpar filtros e inicia despesa na categoria correta`, () => {
      const category = { id, name } as Tables<'categories'>;
      render(<MemoryRouter><Transactions accountingCategory={category} /></MemoryRouter>);
      expect(h.filters).toHaveBeenLastCalledWith(expect.objectContaining({ category_id: id }));
      fireEvent.click(screen.getByText('Clear'));
      expect(h.filters).toHaveBeenLastCalledWith(expect.objectContaining({ category_id: id }));
      fireEvent.click(screen.getByRole('button', { name: 'Novo lançamento' }));
      expect(h.form).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, initialData: { type: 'despesa', category_id: id } }));
    });
  }
});