import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventDialog } from '@/components/crm/CrmEvents';
import type { Tables } from '@/integrations/supabase/types';
import type { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import type { FormValues } from '@/components/settings/CrudDialog';

const h = vi.hoisted(() => ({ save: null as null | ((v: FormValues) => Promise<boolean | string>), toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/components/settings/CrudDialog', () => ({ CrudDialog: (p: { onSave: typeof h.save }) => { h.save = p.onSave; return null; } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); h.save = null; });
const company = { id: 'company-1', name: 'Empresa', unit_id: 'unit-1', owner_id: 'seller-1', active: true, do_not_contact: false } as Tables<'crm_companies'>;
const form = { company_id: 'company-1', title: 'Coffee break', event_date: '2026-11-20', location: 'Auditório', status: 'confirmado', notes: 'Montagem às 14h' };
describe('Eventos: gravação comercial', () => {
  it('salva data, local, observações e status na carteira da empresa', async () => {
    const create = vi.fn().mockResolvedValue('event-1');
    const onCreated = vi.fn();
    render(<EventDialog companies={[company]} events={{ create } as unknown as ReturnType<typeof useSupabaseCrud<Tables<'crm_events'>>>} onClose={() => {}} onCreated={onCreated} />);
    if (!h.save) throw new Error('Cadastro indisponível');
    await act(async () => { await h.save?.(form); });
    expect(create).toHaveBeenCalledWith({ ...form, unit_id: 'unit-1', owner_id: 'seller-1', event_time: null });
    expect(onCreated).toHaveBeenCalledWith('event-1');
  });
  it('não salva evento sem empresa acessível', async () => {
    const create = vi.fn();
    render(<EventDialog companies={[company]} events={{ create } as unknown as ReturnType<typeof useSupabaseCrud<Tables<'crm_events'>>>} onClose={() => {}} />);
    if (!h.save) throw new Error('Cadastro indisponível');
    await act(async () => { expect(await h.save?.({ ...form, company_id: 'other' })).toBe(false); });
    expect(create).not.toHaveBeenCalled();
  });
});