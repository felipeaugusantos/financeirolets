-- Diagnóstico (somente leitura): mostra o que já existe no banco e o que falta para CRM, pedidos B2B,
-- Fábrica e repasses do iFood. Rode primeiro e envie o resultado. Não altera nada.
SELECT e.parte, e.tipo, e.nome,
  CASE e.tipo
    WHEN 'tabela' THEN EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = e.nome)
    WHEN 'funcao' THEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = e.nome)
    WHEN 'coluna' THEN EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name || '.' || c.column_name = e.nome)
    WHEN 'politica' THEN EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename || '.' || pp.policyname = e.nome)
    WHEN 'gatilho' THEN EXISTS (SELECT 1 FROM pg_trigger tg WHERE NOT tg.tgisinternal AND tg.tgrelid::regclass::text || '.' || tg.tgname = e.nome)
  END AS existe
FROM (VALUES
  ('14a', 'funcao', 'crm_can_access'),
  ('14a', 'tabela', 'crm_companies'),
  ('14a', 'coluna', 'crm_companies.external_id'),
  ('14a', 'tabela', 'crm_contacts'),
  ('14b', 'tabela', 'crm_opportunities'),
  ('14b', 'tabela', 'crm_activities'),
  ('14b', 'funcao', 'crm_guard_record'),
  ('14b', 'gatilho', 'crm_opportunities.crm_opportunities_guard'),
  ('14c', 'tabela', 'crm_orders'),
  ('14c', 'coluna', 'crm_orders.total_cost'),
  ('14c', 'coluna', 'crm_orders.opportunity_id'),
  ('14d', 'funcao', 'has_any_role'),
  ('14d', 'tabela', 'crm_products'),
  ('14d', 'tabela', 'factory_ingredients'),
  ('14d', 'coluna', 'factory_ingredients.last_purchase_tx_id'),
  ('14d', 'tabela', 'factory_recipes'),
  ('14d', 'tabela', 'factory_recipe_items'),
  ('14d', 'tabela', 'factory_forecasts'),
  ('14e', 'tabela', 'crm_order_items'),
  ('14e', 'tabela', 'factory_batches'),
  ('14f', 'tabela', 'ifood_stores'),
  ('14f', 'tabela', 'ifood_orders'),
  ('14f', 'tabela', 'ifood_payout_postings')
) AS e(parte, tipo, nome)
ORDER BY e.parte, e.tipo, e.nome;
