-- CRM, parte 1: regra de acesso, empresas e contatos. Idempotente (pode rodar de novo sem erro).
-- Estado final das migrações drizzle 0000, 0002 e 0003 (com o índice de documento por carteira da 0001).
CREATE OR REPLACE FUNCTION public.crm_can_access(p_owner uuid, p_unit uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR (EXISTS (SELECT 1 FROM public.user_units u WHERE u.user_id=auth.uid() AND u.unit_id=p_unit) AND (public.has_role(auth.uid(),'gerente_unidade') OR (public.has_role(auth.uid(),'vendedor') AND p_owner=auth.uid())))) $$;
REVOKE ALL ON FUNCTION public.crm_can_access(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_can_access(uuid,uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.crm_companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, document text, phone text, email text, segment text, address text, source text NOT NULL DEFAULT 'manual', interest text NOT NULL DEFAULT 'coffee_break' CHECK (interest IN ('coffee_break','evento_corporativo','encomenda')), status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','em_contato','qualificado','descartado')), do_not_contact boolean NOT NULL DEFAULT false, notes text, unit_id uuid NOT NULL REFERENCES public.units(id), owner_id uuid NOT NULL DEFAULT auth.uid(), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_companies FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.crm_companies FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_companies TO authenticated;
GRANT ALL ON public.crm_companies TO service_role;
DROP POLICY IF EXISTS crm_companies_read ON public.crm_companies;
CREATE POLICY crm_companies_read ON public.crm_companies FOR SELECT TO authenticated USING (public.crm_can_access(owner_id, unit_id));
DROP POLICY IF EXISTS crm_companies_insert ON public.crm_companies;
CREATE POLICY crm_companies_insert ON public.crm_companies FOR INSERT TO authenticated WITH CHECK (public.crm_can_access(owner_id, unit_id) AND (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS crm_companies_update ON public.crm_companies;
CREATE POLICY crm_companies_update ON public.crm_companies FOR UPDATE TO authenticated USING (public.crm_can_access(owner_id, unit_id)) WITH CHECK (public.crm_can_access(owner_id, unit_id));
DROP INDEX IF EXISTS public.crm_companies_document_unique;
CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_document_unique ON public.crm_companies (unit_id, owner_id, document) WHERE document IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_external_portfolio_unique ON public.crm_companies (unit_id, owner_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_companies_access_idx ON public.crm_companies (unit_id, owner_id);
DROP TRIGGER IF EXISTS crm_companies_updated ON public.crm_companies;
CREATE TRIGGER crm_companies_updated BEFORE UPDATE ON public.crm_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.crm_contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.crm_companies(id), name text NOT NULL, position text, phone text, email text, source text NOT NULL DEFAULT 'manual', confirmed boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_contacts FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.crm_contacts FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;
DROP POLICY IF EXISTS crm_contacts_read ON public.crm_contacts;
CREATE POLICY crm_contacts_read ON public.crm_contacts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id AND public.crm_can_access(c.owner_id, c.unit_id)));
DROP POLICY IF EXISTS crm_contacts_insert ON public.crm_contacts;
CREATE POLICY crm_contacts_insert ON public.crm_contacts FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id AND public.crm_can_access(c.owner_id, c.unit_id)));
DROP POLICY IF EXISTS crm_contacts_update ON public.crm_contacts;
CREATE POLICY crm_contacts_update ON public.crm_contacts FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id AND public.crm_can_access(c.owner_id, c.unit_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = company_id AND public.crm_can_access(c.owner_id, c.unit_id)));
CREATE INDEX IF NOT EXISTS crm_contacts_company_idx ON public.crm_contacts (company_id);
DROP TRIGGER IF EXISTS crm_contacts_updated ON public.crm_contacts;
CREATE TRIGGER crm_contacts_updated BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

NOTIFY pgrst, 'reload schema';
