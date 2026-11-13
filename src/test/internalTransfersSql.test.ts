import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('drizzle/migrations/0011_atomic_own_account_transfers.sql','utf8');
const register = sql.split('CREATE OR REPLACE FUNCTION public.undo_internal_transfer')[0];
const undo = sql.split('CREATE OR REPLACE FUNCTION public.undo_internal_transfer')[1];
describe('transfer database safety contract', () => {
 it('excludes both legs from DRE but preserves real cash and each account unit', () => {
  expect(register).toContain('o.account_id,ao.default_unit_id,false,true');
  expect(register).toContain('i.account_id,ai.default_unit_id,false,true');
 });
 it('requires authorization on the server without bypassing RLS', () => {
  expect(sql.match(/SECURITY INVOKER/g)).toHaveLength(2);
  expect(sql.match(/public.has_role\(auth.uid\(\), 'admin'\)/g)).toHaveLength(2);
  expect(sql.match(/public.has_role\(auth.uid\(\), 'financeiro'\)/g)).toHaveLength(2);
  expect(sql).not.toContain('SECURITY DEFINER');
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.register_internal_transfer(uuid,uuid) FROM PUBLIC, anon');
 });
 it('locks and validates pending unlinked entries before inserting either leg', () => {
  expect(register.indexOf('ORDER BY id FOR UPDATE')).toBeLessThan(register.indexOf('INSERT INTO'));
  expect(register).toContain("o.status <> 'pendente' OR i.status <> 'pendente' OR o.transaction_id IS NOT NULL OR i.transaction_id IS NOT NULL");
  expect(register).toContain('round(abs(o.amount),2)<>round(i.amount,2)');
  expect(register).toContain('abs(o.posted_at-i.posted_at)>2');
 });
 it('cancels both legs and clears both statement links without deleting history', () => {
  expect(undo).toContain("UPDATE public.transactions SET status='cancelado'");
  expect(undo).toContain("transaction_id=NULL,status='pendente'");
  expect(undo).toMatch(/UPDATE public\.transactions SET[^;]+WHERE id=ANY\(ids\)/);
  expect(undo).toMatch(/UPDATE public\.bank_statement_entries SET[^;]+WHERE transaction_id=ANY\(ids\)/);
  expect(undo).not.toMatch(/DELETE FROM/);
 });
});
