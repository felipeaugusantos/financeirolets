-- 1) Pró-labore após o resultado
UPDATE public.dre_lines SET parent_id = NULL, sort_order = 650, code = '5.1'
WHERE id = 'a4100000-0000-0000-0000-000000000001';
UPDATE public.dre_lines SET code = '5.1.01', sort_order = 651 WHERE id = 'a4100100-0000-0000-0000-000000000001';
UPDATE public.dre_lines SET code = '5.1.02', sort_order = 652 WHERE id = 'a4100200-0000-0000-0000-000000000001';

-- 2) Colunas novas
ALTER TABLE public.dre_lines
  ADD COLUMN IF NOT EXISTS line_type text,
  ADD COLUMN IF NOT EXISTS formula text,
  ADD COLUMN IF NOT EXISTS view_scope text NOT NULL DEFAULT 'gerencial';

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS dre_line_contabil_id uuid REFERENCES public.dre_lines(id);

CREATE INDEX IF NOT EXISTS idx_dre_lines_view_scope ON public.dre_lines(view_scope);
CREATE INDEX IF NOT EXISTS idx_categories_dre_line_contabil ON public.categories(dre_line_contabil_id);

-- 3) Plano de contas contábil (view_scope = 'contabil')
DO $$
DECLARE
  c1 uuid; c2 uuid; c4 uuid; c6 uuid; c8 uuid; c10 uuid; c12 uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.dre_lines WHERE view_scope = 'contabil') THEN
    RETURN;
  END IF;

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope)
  VALUES ('RECEITA BRUTA', 'C1', NULL, 1010, true, 1, true, 'subtotal', 'contabil') RETURNING id INTO c1;
  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope) VALUES
    ('Vendas de Produtos', 'C1.01', c1, 1011, false, 1, true, 'analitica', 'contabil'),
    ('Receitas de Vendas e Serviços', 'C1.02', c1, 1012, false, 1, true, 'analitica', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope)
  VALUES ('(-) DEDUÇÕES DA RECEITA', 'C2', NULL, 1020, true, -1, true, 'subtotal', 'contabil') RETURNING id INTO c2;
  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope) VALUES
    ('Impostos sobre Vendas', 'C2.01', c2, 1021, false, -1, true, 'analitica', 'contabil'),
    ('Devoluções e Descontos', 'C2.02', c2, 1022, false, -1, true, 'analitica', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, formula, view_scope)
  VALUES ('= RECEITA LÍQUIDA', 'C3', NULL, 1030, true, 1, true, 'formula', 'C1+C2', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope)
  VALUES ('(-) CUSTO DAS MERCADORIAS VENDIDAS', 'C4', NULL, 1040, true, -1, true, 'subtotal', 'contabil') RETURNING id INTO c4;
  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope) VALUES
    ('CMV / Insumos', 'C4.01', c4, 1041, false, -1, true, 'analitica', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, formula, view_scope)
  VALUES ('= LUCRO BRUTO', 'C5', NULL, 1050, true, 1, true, 'formula', 'C3+C4', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope)
  VALUES ('(-) DESPESAS OPERACIONAIS', 'C6', NULL, 1060, true, -1, true, 'subtotal', 'contabil') RETURNING id INTO c6;
  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope) VALUES
    ('Despesas com Pessoal', 'C6.01', c6, 1061, false, -1, true, 'analitica', 'contabil'),
    ('Despesas Comerciais e Marketing', 'C6.02', c6, 1062, false, -1, true, 'analitica', 'contabil'),
    ('Despesas Administrativas', 'C6.03', c6, 1063, false, -1, true, 'analitica', 'contabil'),
    ('Despesas de Ocupação', 'C6.04', c6, 1064, false, -1, true, 'analitica', 'contabil'),
    ('Outras Despesas Operacionais', 'C6.05', c6, 1065, false, -1, true, 'analitica', 'contabil'),
    ('Depreciação e Amortização', 'C6.06', c6, 1066, false, -1, true, 'analitica', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, formula, view_scope)
  VALUES ('= RESULTADO OPERACIONAL (EBIT)', 'C7', NULL, 1070, true, 1, true, 'formula', 'C5+C6', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope)
  VALUES ('RESULTADO FINANCEIRO', 'C8', NULL, 1080, true, 1, true, 'subtotal', 'contabil') RETURNING id INTO c8;
  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope) VALUES
    ('Receitas Financeiras', 'C8.01', c8, 1081, false, 1, true, 'analitica', 'contabil'),
    ('Despesas Financeiras', 'C8.02', c8, 1082, false, -1, true, 'analitica', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, formula, view_scope)
  VALUES ('= RESULTADO ANTES DO IR/CSLL', 'C9', NULL, 1090, true, 1, true, 'formula', 'C7+C8', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope)
  VALUES ('(-) IR E CSLL', 'C10', NULL, 1100, true, -1, true, 'subtotal', 'contabil') RETURNING id INTO c10;
  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope) VALUES
    ('IRPJ e CSLL', 'C10.01', c10, 1101, false, -1, true, 'analitica', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, formula, view_scope)
  VALUES ('= LUCRO LÍQUIDO DO EXERCÍCIO', 'C11', NULL, 1110, true, 1, true, 'formula', 'C9+C10', 'contabil');

  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope)
  VALUES ('MOVIMENTAÇÕES PATRIMONIAIS E FINANCEIRAS (não afetam o resultado)', 'C12', NULL, 1120, true, 1, true, 'subtotal', 'contabil') RETURNING id INTO c12;
  INSERT INTO public.dre_lines (name, code, parent_id, sort_order, is_subtotal, sign, active, line_type, view_scope) VALUES
    ('Entradas Patrimoniais e Financeiras', 'C12.01', c12, 1121, false, 1, true, 'analitica', 'contabil'),
    ('Saídas Patrimoniais e Financeiras', 'C12.02', c12, 1122, false, -1, true, 'analitica', 'contabil');
END $$;

-- 4) Vínculo automático das categorias sem linha contábil
UPDATE public.categories c
SET dre_line_contabil_id = dl.id
FROM public.dre_lines dl
WHERE dl.view_scope = 'contabil'
  AND c.dre_line_contabil_id IS NULL
  AND dl.code = CASE
    WHEN (SELECT g.code FROM public.dre_lines g WHERE g.id = c.dre_line_id) LIKE '6.1.%' THEN 'C1.02'
    WHEN (SELECT g.code FROM public.dre_lines g WHERE g.id = c.dre_line_id) = '6.2.10' THEN 'C1.02'
    WHEN (SELECT g.code FROM public.dre_lines g WHERE g.id = c.dre_line_id) = '6.2.07' THEN 'C8.01'
    WHEN (SELECT g.code FROM public.dre_lines g WHERE g.id = c.dre_line_id) = '7.2.07' THEN 'C8.02'
    WHEN (SELECT g.code FROM public.dre_lines g WHERE g.id = c.dre_line_id) LIKE '6.%' THEN 'C12.01'
    WHEN (SELECT g.code FROM public.dre_lines g WHERE g.id = c.dre_line_id) LIKE '7.%' THEN 'C12.02'
    WHEN c.type = 'receita' THEN 'C1.02'
    ELSE 'C6.05'
  END;

-- 5) Identidade OFX única por conta
CREATE UNIQUE INDEX IF NOT EXISTS accounts_ofx_identity_uk
  ON public.accounts (ofx_bankid, ofx_acctid) WHERE ofx_acctid IS NOT NULL;

-- 6) Conciliação de cartão
CREATE TABLE IF NOT EXISTS public.card_statement_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id),
  card_last4 text,
  posted_at date NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  row_hash text NOT NULL,
  source_file text,
  status text NOT NULL DEFAULT 'pendente',
  transaction_id uuid REFERENCES public.transactions(id),
  unit_id uuid REFERENCES public.units(id),
  front_id uuid REFERENCES public.business_fronts(id),
  category_id uuid REFERENCES public.categories(id),
  payment_method public.payment_method,
  note text,
  imported_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_statement_entries_row_hash_uk
  ON public.card_statement_entries (row_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_statement_entries TO authenticated;
GRANT ALL ON public.card_statement_entries TO service_role;

ALTER TABLE public.card_statement_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read card entries" ON public.card_statement_entries;
CREATE POLICY "Authenticated can read card entries" ON public.card_statement_entries
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can write card entries" ON public.card_statement_entries;
CREATE POLICY "Authenticated can write card entries" ON public.card_statement_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_card_statement_entries_updated_at ON public.card_statement_entries;
CREATE TRIGGER update_card_statement_entries_updated_at
  BEFORE UPDATE ON public.card_statement_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();