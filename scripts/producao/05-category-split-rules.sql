CREATE TABLE public.category_split_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX category_split_rules_uniq ON public.category_split_rules (category_id, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_split_rules TO authenticated;
GRANT ALL ON public.category_split_rules TO service_role;
ALTER TABLE public.category_split_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Logados leem divisões" ON public.category_split_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Financeiro gerenciam divisões" ON public.category_split_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE TRIGGER update_category_split_rules_updated_at BEFORE UPDATE ON public.category_split_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();