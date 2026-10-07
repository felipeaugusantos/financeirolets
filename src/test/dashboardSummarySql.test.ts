import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * O SQL Editor do Supabase falha com funções grandes (corta o comando no meio). Por isso o SQL do
 * Dashboard é entregue em PARTES pequenas (scripts/producao/11-dashboard/), cada função é uma consulta
 * SQL única (sem DECLARE/BEGIN, sem ";" e sem comentários no corpo) e a migração é a soma das partes.
 */
const DIR = 'scripts/producao/11-dashboard';
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const read = (f: string) => readFileSync(`${DIR}/${f}`, 'utf8');

describe('SQL 11 do Dashboard (partes para o SQL Editor)', () => {
  it('são 7 partes, cada uma pequena', () => {
    expect(files).toHaveLength(7);
    for (const f of files) expect(read(f).length, f).toBeLessThan(4000);
  });

  it('o corpo de cada função não tem ";", comentários nem blocos plpgsql', () => {
    for (const f of files) {
      const bodies = [...read(f).matchAll(/AS \$\$([\s\S]*?)\$\$;/g)].map(m => m[1]);
      expect(bodies.length, f).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(body, f).not.toContain(';');
        expect(body, f).not.toContain('--');
        expect(body, f).not.toMatch(/\b(DECLARE|BEGIN|RAISE|plpgsql)\b/i);
      }
    }
  });

  it('a migração é o cabeçalho + as partes na ordem', () => {
    const migration = readFileSync('supabase/migrations/20261008120000_dashboard_summary.sql', 'utf8');
    const joined = files.map(f => read(f).split('\n').slice(1).join('\n')).join('\n');   // tira a linha "parte n de 7"
    expect(migration.endsWith(joined)).toBe(true);
  });
});
