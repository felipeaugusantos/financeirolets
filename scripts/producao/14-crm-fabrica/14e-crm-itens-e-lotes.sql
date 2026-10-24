-- Itens dos pedidos B2B e fornadas (lotes de produção). Idempotente. Migrações drizzle 0005 e 0009.
-- Exige as partes 14c e 14d (e a função has_any_role).
CREATE TABLE IF NOT EXISTS public.crm_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.crm_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.crm_products(id),
  packages numeric NOT NULL DEFAULT 1,
  cookies_per_package integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.crm_order_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_order_items TO authenticated;
GRANT ALL ON public.crm_order_items TO service_role;
ALTER TABLE public.crm_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_order_items_access ON public.crm_order_items;
CREATE POLICY crm_order_items_access ON public.crm_order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crm_orders o WHERE o.id = order_id AND public.crm_can_access(o.owner_id, o.unit_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.crm_orders o WHERE o.id = order_id AND public.crm_can_access(o.owner_id, o.unit_id)));

CREATE TABLE IF NOT EXISTS public.factory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_date date NOT NULL,
  product_id uuid NOT NULL REFERENCES public.crm_products(id),
  planned_units numeric NOT NULL DEFAULT 0 CHECK (planned_units >= 0),
  produced_units numeric NOT NULL DEFAULT 0 CHECK (produced_units >= 0),
  lost_units numeric NOT NULL DEFAULT 0 CHECK (lost_units >= 0),
  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','produzindo','concluida','cancelada')),
  estimated_cost numeric NOT NULL DEFAULT 0,
  real_cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.factory_batches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factory_batches TO authenticated;
GRANT ALL ON public.factory_batches TO service_role;
ALTER TABLE public.factory_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factory_batches_read ON public.factory_batches;
CREATE POLICY factory_batches_read ON public.factory_batches FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS factory_batches_write ON public.factory_batches;
CREATE POLICY factory_batches_write ON public.factory_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade'));
DROP TRIGGER IF EXISTS factory_batches_updated ON public.factory_batches;
CREATE TRIGGER factory_batches_updated BEFORE UPDATE ON public.factory_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX IF NOT EXISTS factory_batches_date_idx ON public.factory_batches (production_date);
NOTIFY pgrst, 'reload schema';
