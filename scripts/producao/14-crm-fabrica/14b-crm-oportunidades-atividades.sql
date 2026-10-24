-- CRM, parte 2: oportunidades, atividades e a trava de carteira (crm_guard_record). Idempotente.
-- Estado final das migrações drizzle 0000, 0001, 0002 e 0004 (a trava já cobre crm_orders).
-- Exige a parte 14a.
CREATE OR REPLACE FUNCTION public.crm_guard_record() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.crm_guard_record() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_guard_record() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.crm_opportunities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.crm_companies(id), title text NOT NULL, stage text NOT NULL DEFAULT 'qualificacao' CHECK (stage IN ('qualificacao','briefing','proposta','negociacao','ganha','perdida')), estimated_value numeric NOT NULL DEFAULT 0 CHECK (estimated_value >= 0), sale_type text NOT NULL DEFAULT 'coffee_break' CHECK (sale_type IN ('coffee_break','evento_corporativo','encomenda')), event_date date, event_time text, attendees integer CHECK (attendees > 0), delivery_mode text NOT NULL DEFAULT 'entrega' CHECK (delivery_mode IN ('entrega','retirada')), address text, requirements text, requested_items text, loss_reason text, closed_at timestamptz, unit_id uuid NOT NULL REFERENCES public.units(id), production_unit_id uuid REFERENCES public.units(id), owner_id uuid NOT NULL DEFAULT auth.uid(), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (stage <> 'perdida' OR nullif(trim(loss_reason),'') IS NOT NULL));
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_opportunities FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.crm_opportunities FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_opportunities TO authenticated;
GRANT ALL ON public.crm_opportunities TO service_role;
DROP POLICY IF EXISTS crm_opportunities_read ON public.crm_opportunities;
CREATE POLICY crm_opportunities_read ON public.crm_opportunities FOR SELECT TO authenticated USING (public.crm_can_access(owner_id, unit_id) AND EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id));
DROP POLICY IF EXISTS crm_opportunities_insert ON public.crm_opportunities;
CREATE POLICY crm_opportunities_insert ON public.crm_opportunities FOR INSERT TO authenticated WITH CHECK (public.crm_can_access(owner_id, unit_id) AND EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id AND c.unit_id = crm_opportunities.unit_id AND c.owner_id = crm_opportunities.owner_id));
DROP POLICY IF EXISTS crm_opportunities_update ON public.crm_opportunities;
CREATE POLICY crm_opportunities_update ON public.crm_opportunities FOR UPDATE TO authenticated USING (public.crm_can_access(owner_id, unit_id) AND EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id)) WITH CHECK (public.crm_can_access(owner_id, unit_id) AND EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id));
CREATE INDEX IF NOT EXISTS crm_opportunities_access_idx ON public.crm_opportunities (unit_id, owner_id, stage);
DROP TRIGGER IF EXISTS crm_opportunities_updated ON public.crm_opportunities;
CREATE TRIGGER crm_opportunities_updated BEFORE UPDATE ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.crm_activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.crm_companies(id), opportunity_id uuid REFERENCES public.crm_opportunities(id), title text NOT NULL, kind text NOT NULL DEFAULT 'tarefa' CHECK (kind IN ('tarefa','ligacao','reuniao','degustacao','mensagem')), due_date date, completed boolean NOT NULL DEFAULT false, notes text, unit_id uuid NOT NULL REFERENCES public.units(id), owner_id uuid NOT NULL DEFAULT auth.uid(), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_activities FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.crm_activities FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
DROP POLICY IF EXISTS crm_activities_read ON public.crm_activities;
CREATE POLICY crm_activities_read ON public.crm_activities FOR SELECT TO authenticated USING (public.crm_can_access(owner_id, unit_id) AND EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id));
DROP POLICY IF EXISTS crm_activities_insert ON public.crm_activities;
CREATE POLICY crm_activities_insert ON public.crm_activities FOR INSERT TO authenticated WITH CHECK (public.crm_can_access(owner_id, unit_id) AND EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id AND c.unit_id = crm_activities.unit_id AND c.owner_id = crm_activities.owner_id) AND (opportunity_id IS NULL OR EXISTS (SELECT 1 FROM public.crm_opportunities o WHERE o.id = opportunity_id AND o.company_id = crm_activities.company_id)));
DROP POLICY IF EXISTS crm_activities_update ON public.crm_activities;
CREATE POLICY crm_activities_update ON public.crm_activities FOR UPDATE TO authenticated USING (public.crm_can_access(owner_id, unit_id) AND EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id)) WITH CHECK (public.crm_can_access(owner_id, unit_id) AND EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id) AND (opportunity_id IS NULL OR EXISTS (SELECT 1 FROM public.crm_opportunities o WHERE o.id = opportunity_id AND o.company_id = crm_activities.company_id)));
CREATE INDEX IF NOT EXISTS crm_activities_agenda_idx ON public.crm_activities (unit_id, owner_id, due_date);
DROP TRIGGER IF EXISTS crm_activities_updated ON public.crm_activities;
CREATE TRIGGER crm_activities_updated BEFORE UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS crm_companies_guard ON public.crm_companies;
CREATE TRIGGER crm_companies_guard BEFORE UPDATE ON public.crm_companies FOR EACH ROW EXECUTE FUNCTION public.crm_guard_record();
DROP TRIGGER IF EXISTS crm_opportunities_guard ON public.crm_opportunities;
CREATE TRIGGER crm_opportunities_guard BEFORE INSERT OR UPDATE ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.crm_guard_record();
DROP TRIGGER IF EXISTS crm_activities_guard ON public.crm_activities;
CREATE TRIGGER crm_activities_guard BEFORE INSERT OR UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.crm_guard_record();

NOTIFY pgrst, 'reload schema';
