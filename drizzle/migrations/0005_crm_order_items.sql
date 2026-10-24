CREATE TABLE public.crm_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.crm_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.crm_products(id),
  packages numeric NOT NULL DEFAULT 1,
  cookies_per_package integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_order_items TO authenticated;
GRANT ALL ON public.crm_order_items TO service_role;
ALTER TABLE public.crm_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_order_items_access ON public.crm_order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crm_orders o WHERE o.id = order_id AND public.crm_can_access(o.owner_id, o.unit_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.crm_orders o WHERE o.id = order_id AND public.crm_can_access(o.owner_id, o.unit_id)));
ALTER TABLE public.crm_orders ADD COLUMN IF NOT EXISTS total_cost numeric NOT NULL DEFAULT 0;