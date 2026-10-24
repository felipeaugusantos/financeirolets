-- Fábrica, parte 1: produtos, ingredientes, receitas e previsões. Idempotente.
-- ATENÇÃO: o repositório NÃO tem o SQL original destas tabelas (o Lovable as criou direto no banco dele).
-- Esta estrutura foi RECONSTRUÍDA a partir de src/integrations/supabase/types.ts e do código das telas
-- (valores padrão: caixa / 1 / 0, g / 1000; unicidade da previsão por data + unidade + produto).
-- As políticas de acesso seguem o padrão das fornadas (leitura para quem tem algum papel; escrita para
-- Admin, Financeiro e Gerente de unidade). Só rode se o diagnóstico (14-00) mostrar que as tabelas NÃO existem.
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;
REVOKE ALL ON FUNCTION public.has_any_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.crm_products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, code text, flavor_type text, package text NOT NULL DEFAULT 'caixa', cookies_per_package integer NOT NULL DEFAULT 1, weight_grams numeric, price numeric NOT NULL DEFAULT 0, notes text, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.factory_ingredients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, unit text NOT NULL DEFAULT 'g', package_size numeric NOT NULL DEFAULT 1000, package_cost numeric NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.factory_ingredients ADD COLUMN IF NOT EXISTS last_purchase_tx_id uuid REFERENCES public.transactions(id);
ALTER TABLE public.factory_ingredients ADD COLUMN IF NOT EXISTS last_purchase_date date;
CREATE TABLE IF NOT EXISTS public.factory_recipes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.crm_products(id), yield_units numeric NOT NULL DEFAULT 1, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.factory_recipe_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id uuid NOT NULL REFERENCES public.factory_recipes(id) ON DELETE CASCADE, ingredient_id uuid NOT NULL REFERENCES public.factory_ingredients(id), quantity numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.factory_forecasts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), production_date date NOT NULL, unit_id uuid NOT NULL REFERENCES public.units(id), product_id uuid NOT NULL REFERENCES public.crm_products(id), quantity numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (production_date, unit_id, product_id));

ALTER TABLE public.crm_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_forecasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_products, public.factory_ingredients, public.factory_recipes, public.factory_recipe_items, public.factory_forecasts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_products, public.factory_ingredients, public.factory_recipes, public.factory_recipe_items, public.factory_forecasts TO authenticated;
GRANT ALL ON public.crm_products, public.factory_ingredients, public.factory_recipes, public.factory_recipe_items, public.factory_forecasts TO service_role;

DROP POLICY IF EXISTS crm_products_read ON public.crm_products;
CREATE POLICY crm_products_read ON public.crm_products FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS crm_products_write ON public.crm_products;
CREATE POLICY crm_products_write ON public.crm_products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade'));
DROP POLICY IF EXISTS factory_ingredients_read ON public.factory_ingredients;
CREATE POLICY factory_ingredients_read ON public.factory_ingredients FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS factory_ingredients_write ON public.factory_ingredients;
CREATE POLICY factory_ingredients_write ON public.factory_ingredients FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade'));
DROP POLICY IF EXISTS factory_recipes_read ON public.factory_recipes;
CREATE POLICY factory_recipes_read ON public.factory_recipes FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS factory_recipes_write ON public.factory_recipes;
CREATE POLICY factory_recipes_write ON public.factory_recipes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade'));
DROP POLICY IF EXISTS factory_recipe_items_read ON public.factory_recipe_items;
CREATE POLICY factory_recipe_items_read ON public.factory_recipe_items FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS factory_recipe_items_write ON public.factory_recipe_items;
CREATE POLICY factory_recipe_items_write ON public.factory_recipe_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade'));
DROP POLICY IF EXISTS factory_forecasts_read ON public.factory_forecasts;
CREATE POLICY factory_forecasts_read ON public.factory_forecasts FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS factory_forecasts_write ON public.factory_forecasts;
CREATE POLICY factory_forecasts_write ON public.factory_forecasts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade'));

CREATE INDEX IF NOT EXISTS factory_recipes_product_idx ON public.factory_recipes (product_id);
CREATE INDEX IF NOT EXISTS factory_recipe_items_recipe_idx ON public.factory_recipe_items (recipe_id);
DROP TRIGGER IF EXISTS crm_products_updated ON public.crm_products;
CREATE TRIGGER crm_products_updated BEFORE UPDATE ON public.crm_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS factory_ingredients_updated ON public.factory_ingredients;
CREATE TRIGGER factory_ingredients_updated BEFORE UPDATE ON public.factory_ingredients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS factory_recipes_updated ON public.factory_recipes;
CREATE TRIGGER factory_recipes_updated BEFORE UPDATE ON public.factory_recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS factory_forecasts_updated ON public.factory_forecasts;
CREATE TRIGGER factory_forecasts_updated BEFORE UPDATE ON public.factory_forecasts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
NOTIFY pgrst, 'reload schema';
