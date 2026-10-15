-- iFood, etapa 1: base de dados (lojas, pedidos, itens e valores financeiros).
-- Só estrutura: nenhuma coleta é feita ainda. Acesso restrito a Admin/Financeiro.
-- As credenciais de cada loja NAO ficam aqui: ficam nos segredos do Supabase
-- (secret_prefix indica o prefixo, ex.: IFOOD_LOJA1 -> IFOOD_LOJA1_CLIENT_ID).
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.ifood_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  merchant_id text UNIQUE,
  unit_id uuid REFERENCES public.units(id),
  secret_prefix text,
  active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ifood_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.ifood_stores(id),
  ifood_order_id text NOT NULL,
  display_id text,
  status text,
  order_type text,
  delivered_by text,
  ordered_at timestamptz,
  sub_total numeric(14,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(14,2) NOT NULL DEFAULT 0,
  additional_fees numeric(14,2) NOT NULL DEFAULT 0,
  benefits_total numeric(14,2) NOT NULL DEFAULT 0,
  order_amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, ifood_order_id)
);
CREATE INDEX IF NOT EXISTS ifood_orders_store_date_idx ON public.ifood_orders (store_id, ordered_at);

CREATE TABLE IF NOT EXISTS public.ifood_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.ifood_orders(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  external_code text,
  ean text,
  name text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  options_price numeric(14,2) NOT NULL DEFAULT 0,
  total_price numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE (order_id, line_no)
);
CREATE INDEX IF NOT EXISTS ifood_order_items_code_idx ON public.ifood_order_items (external_code);

CREATE TABLE IF NOT EXISTS public.ifood_order_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.ifood_orders(id) ON DELETE CASCADE,
  gross_value numeric(14,2) NOT NULL DEFAULT 0,
  commission numeric(14,2) NOT NULL DEFAULT 0,
  payment_fee numeric(14,2) NOT NULL DEFAULT 0,
  delivery_cost numeric(14,2) NOT NULL DEFAULT 0,
  merchant_promo numeric(14,2) NOT NULL DEFAULT 0,
  ifood_promo numeric(14,2) NOT NULL DEFAULT 0,
  net_value numeric(14,2) NOT NULL DEFAULT 0,
  expected_payout_date date,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_ifood_stores_updated_at ON public.ifood_stores;
CREATE TRIGGER update_ifood_stores_updated_at BEFORE UPDATE ON public.ifood_stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS update_ifood_orders_updated_at ON public.ifood_orders;
CREATE TRIGGER update_ifood_orders_updated_at BEFORE UPDATE ON public.ifood_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS update_ifood_order_financials_updated_at ON public.ifood_order_financials;
CREATE TRIGGER update_ifood_order_financials_updated_at BEFORE UPDATE ON public.ifood_order_financials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.ifood_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ifood_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ifood_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ifood_order_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fin manage ifood stores" ON public.ifood_stores;
CREATE POLICY "Fin manage ifood stores" ON public.ifood_stores
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "Fin manage ifood orders" ON public.ifood_orders;
CREATE POLICY "Fin manage ifood orders" ON public.ifood_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "Fin manage ifood order items" ON public.ifood_order_items;
CREATE POLICY "Fin manage ifood order items" ON public.ifood_order_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "Fin manage ifood order financials" ON public.ifood_order_financials;
CREATE POLICY "Fin manage ifood order financials" ON public.ifood_order_financials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

NOTIFY pgrst, 'reload schema';
