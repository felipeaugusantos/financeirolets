CREATE TABLE public.crm_orders (
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
CREATE INDEX crm_orders_company_idx ON public.crm_orders(company_id);
CREATE INDEX crm_orders_date_idx ON public.crm_orders(order_date);

GRANT SELECT, INSERT, UPDATE ON public.crm_orders TO authenticated;
GRANT ALL ON public.crm_orders TO service_role;
ALTER TABLE public.crm_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_orders_select" ON public.crm_orders FOR SELECT TO authenticated USING (public.crm_can_access(owner_id, unit_id));
CREATE POLICY "crm_orders_insert" ON public.crm_orders FOR INSERT TO authenticated WITH CHECK (public.crm_can_access(owner_id, unit_id));
CREATE POLICY "crm_orders_update" ON public.crm_orders FOR UPDATE TO authenticated USING (public.crm_can_access(owner_id, unit_id)) WITH CHECK (public.crm_can_access(owner_id, unit_id));

CREATE OR REPLACE FUNCTION public.crm_guard_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE c public.crm_companies%ROWTYPE;
BEGIN
 IF TG_OP = 'UPDATE' AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.unit_id IS DISTINCT FROM OLD.unit_id) AND NOT public.has_role(auth.uid(),'admin') THEN
  RAISE EXCEPTION 'Somente administrador pode transferir a carteira' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME IN ('crm_opportunities','crm_activities','crm_orders') THEN
  SELECT * INTO c FROM public.crm_companies WHERE id=NEW.company_id;
  IF NOT FOUND OR NOT public.crm_can_access(c.owner_id,c.unit_id) OR c.unit_id IS DISTINCT FROM NEW.unit_id OR c.owner_id IS DISTINCT FROM NEW.owner_id THEN
   RAISE EXCEPTION 'Empresa indisponível ou carteira incompatível' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' AND c.do_not_contact THEN RAISE EXCEPTION 'Empresa marcada para não contatar' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $function$;

CREATE TRIGGER crm_orders_guard BEFORE INSERT OR UPDATE ON public.crm_orders FOR EACH ROW EXECUTE FUNCTION public.crm_guard_record();
CREATE TRIGGER crm_orders_updated BEFORE UPDATE ON public.crm_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();