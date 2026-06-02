import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) são obrigatórios para os testes de RLS. ' +
    'Sem eles os testes passariam vacuamente.'
  );
}

// Cliente anônimo (sem autenticação) para verificar que RLS bloqueia acesso
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Tabelas sensíveis que NÃO devem permitir leitura por usuários não autenticados.
// Tabelas de domínio público (units, accounts, categories, dre_lines, business_fronts,
// report_templates) possuem policy SELECT `true` para `authenticated`, então
// também devem bloquear o role `anon`.
const PROTECTED_TABLES = [
  "transactions",
  "transaction_allocations",
  "attachments",
  "audit_logs",
  "budgets",
  "partners",
  "profiles",
  "user_roles",
  "user_units",
  "units",
  "accounts",
  "categories",
  "dre_lines",
  "business_fronts",
  "report_templates",
] as const;

describe("RLS — acesso anônimo deve ser bloqueado", () => {
  for (const table of PROTECTED_TABLES) {
    it(`SELECT em ${table} não retorna linhas para anon`, async () => {
      const { data, error } = await anon.from(table as any).select("*").limit(1);
      // Aceita: erro de permissão OU array vazio (RLS filtra tudo)
      const blocked = !!error || (Array.isArray(data) && data.length === 0);
      expect(blocked).toBe(true);
    });

    it(`INSERT em ${table} é rejeitado para anon`, async () => {
      const { error } = await anon.from(table as any).insert({} as any);
      expect(error).not.toBeNull();
    });
  }

  it("has_role NÃO pode ser executada por anon", async () => {
    const { error } = await anon.rpc("has_role", {
      _user_id: "00000000-0000-0000-0000-000000000000",
      _role: "admin",
    } as any);
    expect(error).not.toBeNull();
  });
});