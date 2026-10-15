import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const mig = readFileSync('supabase/migrations/20261016120000_ifood_base.sql', 'utf8');
const prod = readFileSync('scripts/producao/13-ifood-base.sql', 'utf8');
const tables = ['ifood_stores', 'ifood_orders', 'ifood_order_items', 'ifood_order_financials'];

describe('SQL 13 (base do iFood)', () => {
  it('o script de produção é idêntico à migração', () => {
    expect(prod).toBe(mig);
  });
  it.each(tables)('%s tem RLS ligada e política só para Admin/Financeiro', (t) => {
    expect(mig).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    const policy = mig.match(new RegExp(`CREATE POLICY [^;]*ON public\\.${t}\\b[^;]*;`))?.[0] ?? '';
    expect(policy).toContain("has_role(auth.uid(), 'admin')");
    expect(policy).toContain("has_role(auth.uid(), 'financeiro')");
  });
  it('não guarda credenciais no banco', () => {
    expect(mig).not.toMatch(/client_secret\s+text|client_id\s+text|access_token/i);
  });
  it('é idempotente: sem DROP TABLE nem DELETE', () => {
    expect(mig).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i);
  });
});
