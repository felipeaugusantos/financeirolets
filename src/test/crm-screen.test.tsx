import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormValues } from '@/components/settings/CrudDialog';

const h = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue('new-id'), update: vi.fn().mockResolvedValue(true), toast: vi.fn(),
  dialog: null as null | { onSave: (v: FormValues) => Promise<boolean | string>; initialData: FormValues },
  companies: [{ id: 'company-1', name: 'Empresa de teste', unit_id: 'unit-1', owner_id: 'seller-1', active: true, do_not_contact: false, status: 'novo', document: null, phone: null, email: null }],
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'manager-1' } }) }));
vi.mock('@/hooks/useUserRoles', () => ({ useCurrentUserRoles: () => ({ roles: ['gerente_unidade'], loading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/hooks/useSupabaseCrud', () => ({ useSupabaseCrud: (table: string) => ({
  data: table === 'crm_companies' ? h.companies : table === 'units' ? [{ id: 'unit-1', name: 'Unidade de teste', active: true }] : [],
  loading: false, create: h.create, update: h.update,
}) }));
vi.mock('@/components/settings/CrudDialog', () => ({ CrudDialog: (props: NonNullable<typeof h.dialog>) => { h.dialog = props; return null; } }));
import Crm from '@/pages/Crm';

afterEach(() => { cleanup(); vi.clearAllMocks(); h.dialog = null; });
const setup = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/crm/empresas/:companyId" element={<Crm />} /><Route path="/crm/funil" element={<Crm />} /></Routes></MemoryRouter>);
const opportunity = { company_id: 'company-1', title: 'Coffee break', unit_id: 'unit-1', sale_type: 'coffee_break', stage: 'qualificacao', delivery_mode: 'entrega', estimated_value: 1200, attendees: 20 };

describe('CRM: criação comercial segura', () => {
  it('manager cria oportunidade na carteira da empresa, não transfere para si', async () => {
    setup('/crm/funil');
    fireEvent.click(screen.getByRole('button', { name: 'Nova oportunidade' }));
    const dialog = h.dialog;
    if (!dialog) throw new Error('Janela da oportunidade não abriu');
    await act(async () => { await dialog.onSave(opportunity); });
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 'seller-1', unit_id: 'unit-1', estimated_value: 1200, attendees: 20 }));
  });
  it('não salva oportunidade em unidade diferente da empresa', async () => {
    setup('/crm/funil'); fireEvent.click(screen.getByRole('button', { name: 'Nova oportunidade' }));
    const dialog = h.dialog;
    if (!dialog) throw new Error('Janela não abriu');
    await act(async () => { expect(await dialog.onSave({ ...opportunity, unit_id: 'unit-2' })).toBe(false); });
    expect(h.create).not.toHaveBeenCalled();
  });
  it('perda exige motivo e valores negativos são recusados', async () => {
    setup('/crm/funil'); fireEvent.click(screen.getByRole('button', { name: 'Nova oportunidade' }));
    const dialog = h.dialog;
    if (!dialog) throw new Error('Janela não abriu');
    await act(async () => {
      expect(await dialog.onSave({ ...opportunity, stage: 'perdida', loss_reason: '' })).toBe(false);
      expect(await dialog.onSave({ ...opportunity, estimated_value: -1 })).toBe(false);
    });
    expect(h.create).not.toHaveBeenCalled();
  });
  it('ficha da empresa abre tarefa já vinculada à empresa e unidade', () => {
    setup('/crm/empresas/company-1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Novo' })[2]);
    expect(h.dialog?.initialData).toEqual(expect.objectContaining({ company_id: 'company-1', unit_id: 'unit-1' }));
  });
});