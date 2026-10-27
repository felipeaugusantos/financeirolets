import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const mig = readFileSync('supabase/migrations/20261027120000_bank_api_balances.sql', 'utf8');
const prod = readFileSync('scripts/producao/15-api-bradesco-saldos.sql', 'utf8');
const tables = ['bank_balance_snapshots', 'bank_api_sync_runs'];

describe('SQL 15 (saldos e consultas da API do Bradesco)', () => {
  it('o script de produção é idêntico à migração', () => {
    expect(prod).toBe(mig);
  });
  it.each(tables)('%s tem RLS ligada e política só para Admin/Financeiro', (t) => {
    expect(mig).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    const policy = mig.match(new RegExp(`CREATE POLICY \\w+ ON public\\.${t}[^;]*;`))?.[0] ?? '';
    expect(policy).toContain("has_role(auth.uid(), 'admin')");
    expect(policy).toContain("has_role(auth.uid(), 'financeiro')");
  });
  it('nada para o anônimo e nenhuma credencial no banco', () => {
    expect(mig).toMatch(/REVOKE ALL ON public\.bank_balance_snapshots, public\.bank_api_sync_runs FROM anon/);
    expect(mig).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/);
    expect(mig).not.toMatch(/client_secret|client_id|access_token|certificad|password|senha/i);
  });
  it('é idempotente e não apaga dados', () => {
    expect(mig).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i);
    expect(mig).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(mig).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
  });
  it('um saldo por conta, dia e origem', () => {
    expect(mig).toContain('UNIQUE (account_id, ref_date, source)');
  });
});
