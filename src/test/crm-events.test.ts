import { describe, expect, it } from 'vitest';
import { canLinkEvent, EVENT_STATUSES, validateEvent } from '@/lib/crmEventRules';
import { readFileSync } from 'node:fs';

const event = { title: 'Coffee break corporativo', event_date: '2026-11-20', location: 'Auditório da empresa', status: 'confirmado' };
describe('cadastro de eventos', () => {
  it('exige data real', () => {
    expect(validateEvent(event)).toBeNull();
    expect(validateEvent({ ...event, event_date: '' })).not.toBeNull();
    expect(validateEvent({ ...event, event_date: '2026-02-30' })).not.toBeNull();
  });
  it('exige local e nome', () => {
    expect(validateEvent({ ...event, location: ' ' })).not.toBeNull();
    expect(validateEvent({ ...event, title: '' })).not.toBeNull();
  });
  it('aceita somente status definidos', () => {
    for (const status of EVENT_STATUSES) expect(validateEvent({ ...event, status: status.value })).toBeNull();
    expect(validateEvent({ ...event, status: 'outro' })).not.toBeNull();
  });
  it('vincula somente evento ativo da mesma empresa', () => {
    expect(canLinkEvent({ company_id: 'empresa-1', active: true }, 'empresa-1')).toBe(true);
    expect(canLinkEvent({ company_id: 'empresa-2', active: true }, 'empresa-1')).toBe(false);
    expect(canLinkEvent({ company_id: 'empresa-1', active: false }, 'empresa-1')).toBe(false);
  });
});
describe('eventos: proteção e isolamento financeiro', () => {
  const sql = readFileSync('drizzle/migrations/0013_crm_events_and_proposal_links.sql', 'utf8');
  it('aplica autorização de carteira a leitura, cadastro e edição, sem excluir', () => {
    for (const action of ['SELECT', 'INSERT', 'UPDATE']) expect(sql).toContain(`FOR ${action} TO authenticated`);
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('public.crm_can_access(owner_id,unit_id)');
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*TO authenticated/);
  });
  it('impede vínculo entre empresas diferentes no servidor', () => {
    expect(sql).toContain('e.company_id IS DISTINCT FROM NEW.company_id');
    expect(sql).toContain('CREATE TRIGGER crm_opportunity_event_guard BEFORE INSERT OR UPDATE');
  });
  it('não altera dados ou estruturas financeiras', () => {
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE) public\.(?:transactions|transaction_allocations|bank_statement_entries|dre_lines)\b/i);
  });
});