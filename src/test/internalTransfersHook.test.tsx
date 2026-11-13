import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), toast: vi.fn(), result: {data: [] as unknown[], error: null as null | {message:string}} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: h.rpc, from: h.from } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({toast: h.toast}) }));
import { useInternalTransfers } from '@/hooks/useInternalTransfers';
const rows = [
 {id:'out',account_id:'factory',account:{name:'Fábrica'},posted_at:'2026-11-13',amount:-100,status:'pendente',memo:'PIX'},
 {id:'in',account_id:'store',account:{name:'Loja'},posted_at:'2026-11-13',amount:100,status:'pendente',memo:'PIX'},
];
beforeEach(() => {
 vi.clearAllMocks(); h.result = {data: rows,error:null};
 h.from.mockImplementation(() => { const b: Record<string, unknown> = {}; for (const key of ['select','eq','is','gte','lte','order']) b[key] = () => b; b.range = () => Promise.resolve(h.result); return b; });
 h.rpc.mockResolvedValue({data:'group',error:null});
});
describe('confirmed internal transfers', () => {
 it('uses only the atomic RPC; never writes separate legs from the browser', async () => {
  const {result} = renderHook(() => useInternalTransfers('2026-11-01','2026-11-30','factory',0));
  await waitFor(() => expect(result.current.pairs).toHaveLength(1));
  let ok; await act(async () => { ok = await result.current.registerTransfer(result.current.pairs[0]); });
  expect(ok).toBe(true); expect(h.rpc).toHaveBeenCalledWith('register_internal_transfer',{p_out_entry:'out',p_in_entry:'in'});
  expect(h.from.mock.calls.every(([table]) => table === 'bank_statement_entries')).toBe(true);
 });
 it('reports failure without falling back to non-atomic inserts', async () => {
  h.rpc.mockResolvedValue({data:null,error:{message:'Mês fechado'}});
  const {result} = renderHook(() => useInternalTransfers('2026-11-01','2026-11-30','factory',0));
  await waitFor(() => expect(result.current.pairs).toHaveLength(1));
  let ok; await act(async () => {ok = await result.current.registerTransfer(result.current.pairs[0]);});
  expect(ok).toBe(false); expect(h.rpc).toHaveBeenCalledTimes(1); expect(result.current.pairs).toHaveLength(1);
 });
 it('only displays pairs involving the selected account', async () => {
  const {result} = renderHook(() => useInternalTransfers('2026-11-01','2026-11-30','other',0));
  await waitFor(() => expect(result.current.loading).toBe(false)); expect(result.current.pairs).toHaveLength(0);
 });
});
