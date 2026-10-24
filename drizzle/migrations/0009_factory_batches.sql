CREATE TABLE public.factory_batches (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factory_batches TO authenticated;
GRANT ALL ON public.factory_batches TO service_role;
ALTER TABLE public.factory_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY factory_batches_read ON public.factory_batches FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY factory_batches_write ON public.factory_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'gerente_unidade'));
CREATE TRIGGER factory_batches_updated BEFORE UPDATE ON public.factory_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX factory_batches_date_idx ON public.factory_batches(production_date);