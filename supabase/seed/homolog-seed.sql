-- =============================================================================
-- SEED DE HOMOLOGAÇÃO — DADOS FICTÍCIOS
-- =============================================================================
-- NUNCA rode este script no backend de produção.
--
-- Como usar:
--   1. Duplicar (Remix) o projeto → o clone recebe um backend próprio e vazio.
--   2. Aplicar as migrações do projeto no clone (elas já vêm no código).
--   3. Rodar este script UMA VEZ no backend do clone.
--
-- Trava de segurança: se já existirem mais de 50 lançamentos, o script aborta —
-- é o sinal de que o banco tem dados reais e não é um ambiente de homologação.
-- =============================================================================

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.transactions;
  IF n > 50 THEN
    RAISE EXCEPTION 'ABORTADO: % lançamentos encontrados. Este banco não parece ser de homologação.', n;
  END IF;
END $$;

-- ---------------------------------------------------------------- estrutura --
INSERT INTO public.units (name, code, active) VALUES
  ('Loja Demo Centro', 'DEMO-01', true),
  ('Loja Demo Shopping', 'DEMO-02', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.business_fronts (name, description, active) VALUES
  ('Loja Física (demo)', 'Frente fictícia de homologação', true),
  ('Delivery (demo)', 'Frente fictícia de homologação', true),
  ('Institucional/Administrativo (demo)', 'Custos de suporte', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.accounts (name, type, initial_balance, initial_balance_date, active) VALUES
  ('Banco Demo — Conta Corrente', 'corrente', 25000.00, '2026-06-30', true),
  ('Adquirente Demo', 'corrente', 4000.00, '2026-06-30', true),
  ('Caixa Demo', 'caixa', 500.00, '2026-06-30', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.partners (name, type, document, active) VALUES
  ('Fornecedor Demo Insumos', 'fornecedor', '11.111.111/0001-11', true),
  ('Cliente Demo Atacado', 'cliente', '22.222.222/0001-22', true),
  ('Prestador Demo Serviços', 'fornecedor', '33.333.333/0001-33', true)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------ lançamentos --
-- 90 lançamentos fictícios distribuídos em 3 meses, com receitas e despesas
-- ligadas às categorias já existentes (mapeadas ao DRE) e às unidades demo.
WITH cat_rec AS (
  SELECT id FROM public.categories WHERE type = 'receita' AND active ORDER BY sort_order LIMIT 1
), cat_desp AS (
  SELECT id FROM public.categories WHERE type = 'despesa' AND active ORDER BY sort_order LIMIT 1
), un AS (
  SELECT id, row_number() OVER (ORDER BY name) rn FROM public.units WHERE code LIKE 'DEMO-%'
), fr AS (
  SELECT id FROM public.business_fronts WHERE name = 'Loja Física (demo)' LIMIT 1
), acc AS (
  SELECT id FROM public.accounts WHERE name = 'Banco Demo — Conta Corrente' LIMIT 1
), par AS (
  SELECT id FROM public.partners WHERE name = 'Fornecedor Demo Insumos' LIMIT 1
), serie AS (
  SELECT generate_series(0, 89) AS i
)
INSERT INTO public.transactions (
  type, description, amount, tax_amount, net_amount,
  competence_date, due_date, payment_date, status,
  payment_method, account_id, category_id, unit_id, front_id, partner_id,
  affects_dre, affects_cashflow, notes
)
SELECT
  CASE WHEN i % 3 = 0 THEN 'despesa' ELSE 'receita' END::transaction_type,
  CASE WHEN i % 3 = 0
       THEN 'DEMO Compra de insumos #' || i
       ELSE 'DEMO Venda balcão #' || i END,
  valor, 0, valor,
  dia, dia, dia,
  CASE WHEN i % 3 = 0 THEN 'pago' ELSE 'recebido' END::transaction_status,
  CASE WHEN i % 2 = 0 THEN 'pix' ELSE 'cartao_credito' END::payment_method,
  (SELECT id FROM acc),
  CASE WHEN i % 3 = 0 THEN (SELECT id FROM cat_desp) ELSE (SELECT id FROM cat_rec) END,
  (SELECT id FROM un WHERE rn = 1 + (i % 2)),
  (SELECT id FROM fr),
  CASE WHEN i % 3 = 0 THEN (SELECT id FROM par) ELSE NULL END,
  true, true,
  'Registro fictício de homologação'
FROM (
  SELECT i,
         ('2026-06-01'::date + (i % 90)) AS dia,
         round((80 + (i * 37) % 950)::numeric, 2) AS valor
  FROM serie
) s;

-- Conferência rápida do que foi criado.
SELECT
  count(*) AS lancamentos_demo,
  round(sum(net_amount) FILTER (WHERE type = 'receita'), 2) AS receitas,
  round(sum(net_amount) FILTER (WHERE type = 'despesa'), 2) AS despesas
FROM public.transactions
WHERE notes = 'Registro fictício de homologação';
