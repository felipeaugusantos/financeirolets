import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * O SQL Editor do Supabase corta o comando no primeiro ";" interno de uma função grande.
 * Por isso o corpo de dashboard_summary é UMA consulta SQL (sem DECLARE/BEGIN, sem ";" e sem comentários).
 */
describe('scripts/producao/11-dashboard-resumo.sql', () => {
  const sql = readFileSync('scripts/producao/11-dashboard-resumo.sql', 'utf8');

  it('é idêntico à migração', () => {
    expect(sql).toBe(readFileSync('supabase/migrations/20261008120000_dashboard_summary.sql', 'utf8'));
  });

  it('o corpo de dashboard_summary não tem ";", comentários nem blocos plpgsql', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.dashboard_summary(');
    const open = sql.indexOf('AS $$', start) + 'AS $$'.length;
    const close = sql.indexOf('$$;', open);
    expect(start).toBeGreaterThan(0);
    const body = sql.slice(open, close);
    expect(body).not.toContain(';');
    expect(body).not.toContain('--');
    expect(body).not.toMatch(/\b(DECLARE|BEGIN|RAISE|plpgsql)\b/i);
  });
});
