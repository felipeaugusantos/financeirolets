CREATE OR REPLACE FUNCTION public.crm_guard_record() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c public.crm_companies%ROWTYPE;
BEGIN
 IF TG_OP = 'UPDATE' AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.unit_id IS DISTINCT FROM OLD.unit_id) AND NOT public.has_role(auth.uid(),'admin') THEN
  RAISE EXCEPTION 'Somente administrador pode transferir a carteira' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME IN ('crm_opportunities','crm_activities') THEN
  SELECT * INTO c FROM public.crm_companies WHERE id=NEW.company_id;
  IF NOT FOUND OR NOT public.crm_can_access(c.owner_id,c.unit_id) OR c.unit_id IS DISTINCT FROM NEW.unit_id OR c.owner_id IS DISTINCT FROM NEW.owner_id THEN
   RAISE EXCEPTION 'Empresa indisponível ou carteira incompatível' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' AND c.do_not_contact THEN RAISE EXCEPTION 'Empresa marcada para não contatar' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_companies_guard BEFORE UPDATE ON public.crm_companies FOR EACH ROW EXECUTE FUNCTION public.crm_guard_record();
CREATE TRIGGER crm_opportunities_guard BEFORE INSERT OR UPDATE ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.crm_guard_record();
CREATE TRIGGER crm_activities_guard BEFORE INSERT OR UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.crm_guard_record();
ALTER POLICY crm_opportunities_insert ON public.crm_opportunities WITH CHECK(public.crm_can_access(owner_id,unit_id) AND EXISTS(SELECT 1 FROM public.crm_companies c WHERE c.id=company_id AND c.unit_id=crm_opportunities.unit_id AND c.owner_id=crm_opportunities.owner_id));
ALTER POLICY crm_activities_insert ON public.crm_activities WITH CHECK(public.crm_can_access(owner_id,unit_id) AND EXISTS(SELECT 1 FROM public.crm_companies c WHERE c.id=company_id AND c.unit_id=crm_activities.unit_id AND c.owner_id=crm_activities.owner_id) AND (opportunity_id IS NULL OR EXISTS(SELECT 1 FROM public.crm_opportunities o WHERE o.id=opportunity_id AND o.company_id=crm_activities.company_id)));
DROP INDEX public.crm_companies_document_unique;
CREATE UNIQUE INDEX crm_companies_document_unique ON public.crm_companies(unit_id,owner_id,document) WHERE document IS NOT NULL;
REVOKE ALL ON FUNCTION public.crm_guard_record() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_guard_record() TO authenticated,service_role;