import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * O SQL chega ao banco por três canais (ver docs/migracoes.md). Estes testes seguram o que dá para
 * garantir sem banco: cópias idênticas não podem divergir e os índices de migração precisam ser coerentes.
 */
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
const read = (p: string) => readFileSync(p, 'utf8');

// scripts/producao/* é a entrega para o SQL Editor; estes têm o mesmo corpo da migração correspondente.
const MIRRORS: [string, string][] = [
  ['scripts/producao/07-criar-lancamento-do-extrato-atomico.sql', 'supabase/migrations/20261003210000_create_transaction_from_entries.sql'],
  ['scripts/producao/08-criar-lancamento-do-cartao-atomico.sql', 'supabase/migrations/20261003230000_create_transaction_from_card_entry.sql'],
  ['scripts/producao/09-salvar-e-excluir-lancamento-atomico.sql', 'supabase/migrations/20261006120000_save_and_delete_transaction_atomic.sql'],
  ['scripts/producao/10-desvincular-e-excluir-lancamento.sql', 'supabase/migrations/20261007120000_unlink_statement_entries.sql'],
  ['scripts/producao/13-ifood-base.sql', 'supabase/migrations/20261016120000_ifood_base.sql'],
  ['scripts/producao/15-api-bradesco-saldos.sql', 'supabase/migrations/20261027120000_bank_api_balances.sql'],
  ['scripts/producao/16-kaikin-limites.sql', 'supabase/migrations/20261029120000_kaikin_usage_limits.sql'],
];

describe('migrações: cópias de produção', () => {
  it.each(MIRRORS)('%s tem o mesmo SQL de %s', (script, migration) => {
    expect(normalize(read(script))).toBe(normalize(read(migration)));
  });
});

describe('migrações: supabase/migrations', () => {
  const files = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'));

  it('nomes seguem <14 dígitos>_<nome>.sql e os prefixos são únicos', () => {
    const prefixes = files.map(f => f.match(/^(\d{14})_.+\.sql$/)?.[1]);
    expect(prefixes.every(Boolean), files.filter(f => !/^\d{14}_.+\.sql$/.test(f)).join(', ')).toBe(true);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('toda cópia de produção apontada existe', () => {
    for (const [script, migration] of MIRRORS) {
      expect(files).toContain(migration.split('/').pop());
      expect(() => read(script)).not.toThrow();
    }
  });
});

describe('migrações: drizzle', () => {
  for (const dir of ['drizzle/migrations', 'drizzle/legacy-migrations']) {
    it(`${dir}: o journal lista exatamente os .sql da pasta, em ordem`, () => {
      const journal = JSON.parse(read(`${dir}/meta/_journal.json`)) as { entries: { idx: number; tag: string }[] };
      const sqlTags = readdirSync(dir).filter(f => f.endsWith('.sql')).map(f => f.replace(/\.sql$/, '')).sort();
      expect(journal.entries.map(e => e.tag)).toEqual(sqlTags);
      expect(journal.entries.map(e => e.idx)).toEqual(journal.entries.map((_, i) => i));
    });
  }
});
