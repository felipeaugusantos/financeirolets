import { describe, expect, it } from 'vitest';
import { findInternalTransfers, type TransferCandidateEntry } from '@/lib/internalTransfers';

const entry = (id: string, account_id: string, amount: number, posted_at = '2026-11-13'): TransferCandidateEntry => ({
 id, account_id, account_name: account_id, amount, posted_at, status: 'pendente', memo: 'PIX',
});
describe('own-account transfer suggestions', () => {
 it('pairs the same amount in opposite directions and different accounts', () => {
  const pairs = findInternalTransfers([entry('a','factory',-100),entry('b','store',100)]);
  expect(pairs).toHaveLength(1); expect(pairs[0].out.account_id).toBe('factory'); expect(pairs[0].in.account_id).toBe('store'); expect(pairs[0].amount).toBe(100);
 });
 it('does not treat same-account movements as transfers', () => {
  expect(findInternalTransfers([entry('a','factory',-100),entry('b','factory',100)])).toHaveLength(0);
 });
 it('does not select an arbitrary receiving account for repeated amounts', () => {
  expect(findInternalTransfers([entry('a','factory',-100),entry('b','store',100),entry('c','cafe',100)])).toHaveLength(0);
 });
 it('does not select an arbitrary sending account for repeated amounts', () => {
  expect(findInternalTransfers([entry('a','factory',-100),entry('b','store',-100),entry('c','cafe',100)])).toHaveLength(0);
 });
 it('rejects different amounts rather than changing the bank balance by a cent', () => {
  expect(findInternalTransfers([entry('a','factory',-100),entry('b','store',100.01)])).toHaveLength(0);
 });
 it('accepts a two-day gap but not a three-day gap', () => {
  expect(findInternalTransfers([entry('a','factory',-100),entry('b','store',100,'2026-11-15')])).toHaveLength(1);
  expect(findInternalTransfers([entry('a','factory',-100),entry('b','store',100,'2026-11-16')])).toHaveLength(0);
 });
 it('never suggests an already linked entry', () => {
  expect(findInternalTransfers([entry('a','factory',-100),{...entry('b','store',100),status:'vinculado'}])).toHaveLength(0);
 });
});
