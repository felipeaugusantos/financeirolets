import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// O que seria versionado: já rastreado + novos não ignorados (pega um .env que escapasse do .gitignore).
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean);

describe('higiene do repositório', () => {
  it('x.pdf não está na raiz nem versionado', () => {
    expect(existsSync('x.pdf')).toBe(false);
    expect(tracked).not.toContain('x.pdf');
  });

  it('nenhum arquivo .env real é versionado (só o modelo .env.example)', () => {
    const envFiles = tracked.filter(f => /(^|\/)\.env(\..*)?$/.test(f));
    expect(envFiles).toEqual(['.env.example']);
  });

  it('.gitignore ignora .env e variações, mas mantém o modelo', () => {
    const ignore = readFileSync('.gitignore', 'utf8').split('\n').map(l => l.trim());
    expect(ignore).toContain('.env');
    expect(ignore).toContain('.env.*');
    expect(ignore).toContain('!.env.example');
  });

  it('.env.example tem só nomes, com valores vazios', () => {
    const lines = readFileSync('.env.example', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l, l).toMatch(/^[A-Z][A-Z0-9_]*=$/);
  });

  it('.env.example lista toda variável VITE_* usada no código', () => {
    const declared = new Set(readFileSync('.env.example', 'utf8').match(/^VITE_[A-Z0-9_]+(?==)/gm));
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) {
          for (const m of readFileSync(p, 'utf8').matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) used.add(m[1]);
        }
      }
    };
    walk('src');
    expect([...used].filter(v => !declared.has(v))).toEqual([]);
  });

  it('o CI recebe as variáveis públicas pelas variáveis do repositório (não pelo .env)', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    for (const v of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PROJECT_ID']) {
      expect(ci).toContain(`${v}: \${{ vars.${v} }}`);
    }
  });

  it('drizzle-orm e drizzle-kit estão fixados (sem faixa) na versão que o bun.lock resolve', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const lock = readFileSync('bun.lock', 'utf8');
    for (const name of ['drizzle-orm', 'drizzle-kit']) {
      const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
      expect(declared, `${name} no package.json`).toMatch(/^\d+\.\d+\.\d+$/);
      expect(lock, `${name} resolvido no bun.lock`).toContain(`"${name}": ["${name}@${declared}"`);
      // O bloco de especificadores do lock também precisa estar igual ao package.json (senão --frozen-lockfile falha).
      expect(lock).toContain(`"${name}": "${declared}"`);
    }
  });
});
