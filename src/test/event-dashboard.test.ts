import { describe, it, expect } from 'vitest';
import { proposalTotalsByEvent } from '@/lib/eventDashboard';
describe('valor das propostas por evento', () => {
  it('soma ativas, ignora perdidas e arquivadas', () => {
    const r = proposalTotalsByEvent([
      { event_id: 'e1', estimated_value: 1000, stage: 'proposta', active: true },
      { event_id: 'e1', estimated_value: 500.5, stage: 'ganha', active: true },
      { event_id: 'e1', estimated_value: 900, stage: 'perdida', active: true },
      { event_id: 'e1', estimated_value: 700, stage: 'proposta', active: false },
      { event_id: null, estimated_value: 300, stage: 'proposta', active: true },
    ]);
    expect(r.e1).toEqual({ total: 1500.5, won: 500.5, count: 2 });
  });
});
