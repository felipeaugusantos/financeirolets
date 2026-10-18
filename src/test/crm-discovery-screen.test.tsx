import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ invoke: vi.fn(), create: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: h.invoke } } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: { children: React.ReactNode; onValueChange: (s: string) => void; value: string }) => <select aria-label={value === 'coffee_break' ? 'interest' : 'unit'} value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => <option value="">Selecionar</option>, SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
import { CompanyDiscovery } from '@/components/crm/CompanyDiscovery';
const unit = '11111111-1111-4111-8111-111111111111';
const result = { name: 'Empresa real consultada', external_id: 'cnpj:12345678000195', document: '12345678000195', address: 'Rua A', phone: '16999999999', email: null, segment: 'Escritório', source: 'brasilapi', website: null };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const setup = () => render(<MemoryRouter><CompanyDiscovery companies={[]} unitOptions={[{ value: unit, label: 'Café' }]} create={h.create} /></MemoryRouter>);
describe('Busca e importação de empresas', () => {
  it('busca sem gravar; importa somente os dados selecionados para a carteira', async () => {
    h.invoke.mockResolvedValue({ data: { results: [result] }, error: null }); h.create.mockResolvedValue('company-id');
    setup(); fireEvent.change(screen.getByLabelText('unit'), { target: { value: unit } });
    fireEvent.change(screen.getByLabelText('CNPJ', { selector: 'input' }), { target: { value: '12.345.678/0001-95' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar empresas' }));
    await screen.findByText('Empresa real consultada');
    expect(h.invoke).toHaveBeenCalledWith('crm-discovery', { body: { mode: 'cnpj', cnpj: '12345678000195', unitId: unit } });
    expect(h.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Importar selecionadas' }));
    await waitFor(() => expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ name: result.name, document: result.document, unit_id: unit, owner_id: 'owner', interest: 'coffee_break', status: 'novo' })));
    expect(h.create).toHaveBeenCalledTimes(1);
  });
  it('recusa consulta incompleta antes de chamar o serviço', async () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Buscar empresas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Selecione a unidade');
    expect(h.invoke).not.toHaveBeenCalled();
  });
});