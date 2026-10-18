import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Credenciais públicas necessárias para testar proteção do CRM');
const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = readFileSync('drizzle/migrations/0000_crm_workspace.sql', 'utf8');
const integritySql = readFileSync('drizzle/migrations/0001_crm_parent_access_integrity.sql', 'utf8');
const uuid = '00000000-0000-0000-0000-000000000000';

describe('CRM permanece isolado dos lançamentos financeiros', () => {
  it('cria somente estruturas comerciais sem alterar tabelas financeiras', () => {
    const tables = [...sql.matchAll(/CREATE TABLE public\.(\w+)/g)].map(m => m[1]);
    expect(tables.sort()).toEqual(['crm_activities','crm_companies','crm_contacts','crm_opportunities']);
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE|CREATE TRIGGER[^;]*ON) public\.(?:transactions|transaction_allocations|bank_statement_entries|card_statement_entries|categories|dre_lines)\b/i);
    const page = readFileSync('src/pages/Crm.tsx', 'utf8');
    expect(page).not.toMatch(/(?:\.from|useSupabaseCrud[^\n]*?)\(['"](?:transactions|transaction_allocations|partners)['"]/);
  });
  it('autoriza vendedores apenas com vínculo à unidade e propriedade da carteira', () => {
    expect(sql).toMatch(/u\.user_id=auth\.uid\(\) AND u\.unit_id=p_unit/);
    expect(sql).toMatch(/has_role\(auth\.uid\(\),'vendedor'\) AND p_owner=auth\.uid\(\)/);
    expect(sql).not.toMatch(/has_role\(auth\.uid\(\),'(?:operador|financeiro)'\)/);
  });
  it('contatos dependem do acesso à empresa e atividades validam a empresa da oportunidade', () => {
    expect(sql).toMatch(/c\.id=company_id AND public\.crm_can_access\(c\.owner_id,c\.unit_id\)/);
    expect(sql).toMatch(/o\.company_id=crm_activities\.company_id/);
  });
  it('transferência de carteira só é permitida ao administrador e filhos herdam a carteira', () => {
    expect(integritySql).toContain("NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.unit_id IS DISTINCT FROM OLD.unit_id");
    expect(integritySql).toContain("NOT public.has_role(auth.uid(),'admin')");
    expect(integritySql).toContain('c.unit_id IS DISTINCT FROM NEW.unit_id OR c.owner_id IS DISTINCT FROM NEW.owner_id');
  });
  const records = {
    crm_companies: { name: 'RLS validation', unit_id: uuid, owner_id: uuid },
    crm_contacts: { name: 'RLS validation', company_id: uuid },
    crm_opportunities: { title: 'RLS validation', company_id: uuid, unit_id: uuid, owner_id: uuid },
    crm_activities: { title: 'RLS validation', company_id: uuid, unit_id: uuid, owner_id: uuid },
  };
  for (const [table, row] of Object.entries(records)) {
    it(`${table}: nega leitura anônima por permissão (não por ausência de dados)`, async () => {
      const { error } = await anon.from(table).select('*').limit(1);
      expect(error?.code).toBe('42501');
    });
    it(`${table}: nega cadastro anônimo com campos obrigatórios preenchidos`, async () => {
      const { error } = await anon.from(table).insert(row);
      expect(error?.code).toBe('42501');
    });
    it(`${table}: mantém histórico sem permitir exclusão pelo cliente`, () => {
      expect(sql).toContain(`GRANT SELECT,INSERT,UPDATE ON public.${table} TO authenticated`);
      expect(sql).not.toContain(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    });
  }
  it('nega a função de autorização a visitantes', async () => {
    const { error } = await anon.rpc('crm_can_access', { p_owner: uuid, p_unit: uuid });
    expect(error?.code).toBe('42501');
  });
});