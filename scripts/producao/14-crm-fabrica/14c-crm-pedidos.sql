-- CRM, parte 3: pedidos B2B (crm_orders). Idempotente. Estado final das migrações drizzle 0004, 0005 (coluna
-- total_cost) e 0008 (vínculo com a oportunidade). Exige as partes 14a e 14b.
CREATE TABLE IF NOT EXISTS public.crm_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.crm_companies(id),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  owner_id uuid NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  delivery_date date,
  quantity_boxes integer NOT NULL DEFAULT 0,
  quantity_cookies integer NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_terms text NOT NULL DEFAULT 'boleto_7',
  due_date date,
  seller_name text,
  status text NOT NULL DEFAULT 'pendente',
  notes text,
  transaction_id uuid REFERENCES public.transactions(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_orders_status_chk CHECK (status IN ('pendente','em_producao','enviado','faturado','cancelado')),
  CONSTRAINT crm_orders_amounts_chk CHECK (total_amount >= 0 AND quantity_boxes >= 0 AND quantity_cookies >= 0)
);
ALTER TABLE public.crm_orders ADD COLUMN IF NOT EXISTS total_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.crm_orders ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.crm_opportunities(id);
CREATE UNIQUE INDEX IF NOT EXISTS crm_orders_opportunity_uniq ON public.crm_orders (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_orders_company_idx ON public.crm_orders (company_id);
CREATE INDEX IF NOT EXISTS crm_orders_date_idx ON public.crm_orders (order_date);
ALTER TABLE public.crm_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_orders FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.crm_orders TO authenticated;
GRANT ALL ON public.crm_orders TO service_role;
DROP POLICY IF EXISTS crm_orders_select ON public.crm_orders;
CREATE POLICY crm_orders_select ON public.crm_orders FOR SELECT TO authenticated USING (public.crm_can_access(owner_id, unit_id));
DROP POLICY IF EXISTS crm_orders_insert ON public.crm_orders;
CREATE POLICY crm_orders_insert ON public.crm_orders FOR INSERT TO authenticated WITH CHECK (public.crm_can_access(owner_id, unit_id));
DROP POLICY IF EXISTS crm_orders_update ON public.crm_orders;
CREATE POLICY crm_orders_update ON public.crm_orders FOR UPDATE TO authenticated USING (public.crm_can_access(owner_id, unit_id)) WITH CHECK (public.crm_can_access(owner_id, unit_id));
DROP TRIGGER IF EXISTS crm_orders_guard ON public.crm_orders;
CREATE TRIGGER crm_orders_guard BEFORE INSERT OR UPDATE ON public.crm_orders FOR EACH ROW EXECUTE FUNCTION public.crm_guard_record();
DROP TRIGGER IF EXISTS crm_orders_updated ON public.crm_orders;
CREATE TRIGGER crm_orders_updated BEFORE UPDATE ON public.crm_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
NOTIFY pgrst, 'reload schema';
