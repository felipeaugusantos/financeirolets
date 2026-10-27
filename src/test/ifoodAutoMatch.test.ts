import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { matchIfoodPayouts } from '@/lib/ifoodAutoMatch';

const payout = { receivable_id: 'r1', week_start: '2026-10-05', net: 1234.56 };

describe('matchIfoodPayouts', () => {
  it('casa crédito iFood com valor líquido igual dentro de 21 dias', () => {
    const m = matchIfoodPayouts([{ id: 'e1', posted_at: '2026-10-14', amount: 1234.56, memo: 'PIX RECEBIDO IFOOD.COM' }], [payout]);
    expect(m).toEqual([{ entryId: 'e1', receivableId: 'r1' }]);
  });

  it('não casa valor diferente, sem "iFood" ou fora do prazo', () => {
    expect(matchIfoodPayouts([{ id: 'e1', posted_at: '2026-10-14', amount: 1234.0, memo: 'IFOOD' }], [payout])).toEqual([]);
    expect(matchIfoodPayouts([{ id: 'e1', posted_at: '2026-10-14', amount: 1234.56, memo: 'TED FULANO' }], [payout])).toEqual([]);
    expect(matchIfoodPayouts([{ id: 'e1', posted_at: '2026-10-27', amount: 1234.56, memo: 'IFOOD' }], [payout])).toEqual([]);
  });

  it('deixa para conferência manual quando há duas opções', () => {
    const lines = [
      { id: 'e1', posted_at: '2026-10-12', amount: 1234.56, memo: 'IFOOD' },
      { id: 'e2', posted_at: '2026-10-13', amount: 1234.56, memo: 'IFOOD' },
    ];
    expect(matchIfoodPayouts(lines, [payout])).toEqual([]);
  });
});
