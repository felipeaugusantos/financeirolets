CREATE TABLE public.crm_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.crm_companies(id),
 title text NOT NULL,
 event_date date NOT NULL,
 event_time text,
 location text NOT NULL,
 notes text,
 status text NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado','confirmado','realizado','cancelado')),
 unit_id uuid NOT NULL REFERENCES public.units(id),
 owner_id uuid NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT crm_events_title_required CHECK (length(trim(title)) > 0),
 CONSTRAINT crm_events_location_required CHECK (length(trim(location)) > 0)
);
GRANT SELECT, INSERT, UPDATE ON public.crm_events TO authenticated;
GRANT ALL ON public.crm_events TO service_role;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_events_select ON public.crm_events FOR SELECT TO authenticated USING (public.crm_can_access(owner_id,unit_id));
CREATE POLICY crm_events_insert ON public.crm_events FOR INSERT TO authenticated WITH CHECK (public.crm_can_access(owner_id,unit_id));
CREATE POLICY crm_events_update ON public.crm_events FOR UPDATE TO authenticated USING (public.crm_can_access(owner_id,unit_id)) WITH CHECK (public.crm_can_access(owner_id,unit_id));
CREATE FUNCTION public.crm_guard_event() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.crm_companies%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.crm_companies WHERE id=NEW.company_id;
 IF NOT FOUND OR NOT public.crm_can_access(c.owner_id,c.unit_id) OR NEW.owner_id IS DISTINCT FROM c.owner_id OR NEW.unit_id IS DISTINCT FROM c.unit_id THEN
  RAISE EXCEPTION 'Empresa indisponível ou carteira incompatível' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.unit_id IS DISTINCT FROM OLD.unit_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) AND NOT public.has_role(auth.uid(),'admin') THEN
  RAISE EXCEPTION 'Somente administrador pode transferir a carteira' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_events_guard BEFORE INSERT OR UPDATE ON public.crm_events FOR EACH ROW EXECUTE FUNCTION public.crm_guard_event();
CREATE TRIGGER crm_events_updated BEFORE UPDATE ON public.crm_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
ALTER TABLE public.crm_opportunities ADD COLUMN event_id uuid REFERENCES public.crm_events(id);
CREATE INDEX crm_events_company_date_idx ON public.crm_events(company_id,event_date);
CREATE INDEX crm_opportunities_event_idx ON public.crm_opportunities(event_id);
CREATE FUNCTION public.crm_guard_opportunity_event() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE e public.crm_events%ROWTYPE;
BEGIN
 IF NEW.event_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO e FROM public.crm_events WHERE id=NEW.event_id;
 IF NOT FOUND OR e.company_id IS DISTINCT FROM NEW.company_id OR e.unit_id IS DISTINCT FROM NEW.unit_id OR e.owner_id IS DISTINCT FROM NEW.owner_id OR NOT public.crm_can_access(e.owner_id,e.unit_id) THEN
  RAISE EXCEPTION 'Evento indisponível ou pertence a outra empresa' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_opportunity_event_guard BEFORE INSERT OR UPDATE ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.crm_guard_opportunity_event();