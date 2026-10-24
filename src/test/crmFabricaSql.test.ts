import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'scripts/producao/14-crm-fabrica';
const files = readdirSync(dir).filter(f => /^14[a-f]-.*\.sql$/.test(f)).sort();
const read = (f: string) => readFileSync(`${dir}/${f}`, 'utf8');
const all = files.map(read).join('\n');

describe('SQL 14 (CRM, pedidos B2B, Fábrica e repasses do iFood)', () => {
  it('tem as seis partes, em ordem', () => {
    expect(files.map(f => f.slice(0, 3))).toEqual(['14a', '14b', '14c', '14d', '14e', '14f']);
  });
  it('o diagnóstico só lê (nenhum comando que altere o banco)', () => {
    const d = readFileSync(`${dir}/14-00-diagnostico.sql`, 'utf8').replace(/--.*$/gm, '');
    expect(d).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE)\b/i);
  });
  it.each(files)('%s é idempotente (pode rodar de novo)', (f) => {
    const s = read(f);
    for (const m of s.matchAll(/CREATE TABLE (?!IF NOT EXISTS)/g)) throw new Error(`CREATE TABLE sem IF NOT EXISTS em ${f} (${m.index})`);
    const policies = [...s.matchAll(/CREATE POLICY (\w+) ON (public\.\w+)/g)];
    for (const [, name, table] of policies) expect(s).toContain(`DROP POLICY IF EXISTS ${name} ON ${table};`);
    const triggers = [...s.matchAll(/CREATE TRIGGER (\w+) [A-Z ]+ ON (public\.\w+)/g)];
    for (const [, name, table] of triggers) expect(s).toContain(`DROP TRIGGER IF EXISTS ${name} ON ${table};`);
    expect(s).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
    expect(s).toContain("NOTIFY pgrst, 'reload schema'");
  });
  it('cobre todas as tabelas criadas pelas migrações drizzle do CRM, pedidos, fábrica e repasses', () => {
    const drizzle = readdirSync('drizzle/migrations').filter(f => f.endsWith('.sql')).map(f => readFileSync(`drizzle/migrations/${f}`, 'utf8')).join('\n');
    const tables = [...drizzle.matchAll(/CREATE TABLE public\.(\w+)/g)].map(m => m[1]);
    expect(tables.length).toBeGreaterThanOrEqual(8);
    for (const t of tables) expect(all, `tabela ${t}`).toContain(`CREATE TABLE IF NOT EXISTS public.${t} `);
  });
  it('nenhum acesso anônimo e nenhuma exclusão liberada para o CRM', () => {
    expect(all).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/);
    const crm = read('14a-crm-empresas-contatos.sql') + read('14b-crm-oportunidades-atividades.sql');
    expect(crm).not.toMatch(/GRANT[^;]*\bDELETE\b[^;]*crm_(companies|contacts|opportunities|activities)/);
  });
  it('a parte reconstruída (14d) avisa que deve ser conferida e só rodar se faltar', () => {
    const d = read('14d-fabrica-base.sql');
    expect(d).toMatch(/RECONSTRU[ÍI]DA/);
    expect(d).toMatch(/Só rode se o diagnóstico/);
  });
});
