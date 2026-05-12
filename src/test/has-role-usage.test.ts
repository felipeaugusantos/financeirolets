import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "test" || entry.startsWith(".")) continue;
      walk(full, files);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("has_role — uso restrito a autorização via RLS", () => {
  it("não é invocada diretamente pelo cliente (rpc/from)", () => {
    const files = walk("src");
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Detecta chamadas tipo supabase.rpc("has_role", ...) no código do cliente.
      if (/\.rpc\(\s*['"`]has_role['"`]/.test(src)) {
        offenders.push(f);
      }
    }
    expect(
      offenders,
      `has_role deve ser usada apenas em policies RLS no banco. Chamadas encontradas em:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("decisões de UI usam useUserRoles, não has_role direto", () => {
    const files = walk("src");
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // 'has_role' não deve aparecer como string em código de cliente
      // (exceto neste próprio arquivo de teste).
      if (f.endsWith("has-role-usage.test.ts") || f.endsWith("rls.test.ts")) continue;
      expect(src.includes("has_role"), `${f} referencia has_role`).toBe(false);
    }
  });
});