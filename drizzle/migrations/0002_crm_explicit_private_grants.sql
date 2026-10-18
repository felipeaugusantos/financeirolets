REVOKE ALL ON public.crm_companies,public.crm_contacts,public.crm_opportunities,public.crm_activities FROM anon;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.crm_companies,public.crm_contacts,public.crm_opportunities,public.crm_activities FROM authenticated;
GRANT SELECT,INSERT,UPDATE ON public.crm_companies,public.crm_contacts,public.crm_opportunities,public.crm_activities TO authenticated;
GRANT ALL ON public.crm_companies,public.crm_contacts,public.crm_opportunities,public.crm_activities TO service_role;