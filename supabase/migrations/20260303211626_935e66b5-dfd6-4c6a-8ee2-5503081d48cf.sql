
-- Fix ALL RLS policies: change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Admins can manage units" ON public.units;
DROP POLICY IF EXISTS "Auth users can read units" ON public.units;
CREATE POLICY "Admins can manage units" ON public.units FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can read units" ON public.units FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage fronts" ON public.business_fronts;
DROP POLICY IF EXISTS "Auth users can read fronts" ON public.business_fronts;
CREATE POLICY "Admins can manage fronts" ON public.business_fronts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can read fronts" ON public.business_fronts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage accounts" ON public.accounts;
DROP POLICY IF EXISTS "Auth users can read accounts" ON public.accounts;
CREATE POLICY "Admins can manage accounts" ON public.accounts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can read accounts" ON public.accounts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Auth users can read categories" ON public.categories;
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can read categories" ON public.categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage dre_lines" ON public.dre_lines;
DROP POLICY IF EXISTS "Auth users can read dre_lines" ON public.dre_lines;
CREATE POLICY "Admins can manage dre_lines" ON public.dre_lines FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can read dre_lines" ON public.dre_lines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage partners" ON public.partners;
DROP POLICY IF EXISTS "Auth users can read partners" ON public.partners;
CREATE POLICY "Admins can manage partners" ON public.partners FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can read partners" ON public.partners FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage transactions" ON public.transactions;
DROP POLICY IF EXISTS "Auth users can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Auth users can read transactions" ON public.transactions;
CREATE POLICY "Admins can manage transactions" ON public.transactions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can insert transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Auth users can read transactions" ON public.transactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage allocations" ON public.transaction_allocations;
DROP POLICY IF EXISTS "Auth users can read allocations" ON public.transaction_allocations;
CREATE POLICY "Admins can manage allocations" ON public.transaction_allocations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can read allocations" ON public.transaction_allocations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage attachments" ON public.attachments;
DROP POLICY IF EXISTS "Auth users can insert attachments" ON public.attachments;
DROP POLICY IF EXISTS "Auth users can read attachments" ON public.attachments;
CREATE POLICY "Admins can manage attachments" ON public.attachments FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Auth users can insert attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Auth users can read attachments" ON public.attachments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage report_templates" ON public.report_templates;
DROP POLICY IF EXISTS "Auth users can read report_templates" ON public.report_templates;
CREATE POLICY "Admins can manage report_templates" ON public.report_templates FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can read report_templates" ON public.report_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can read audit_logs" ON public.audit_logs;
CREATE POLICY "Admins can read audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage user_units" ON public.user_units;
DROP POLICY IF EXISTS "Users can view own units" ON public.user_units;
CREATE POLICY "Admins can manage user_units" ON public.user_units FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own units" ON public.user_units FOR SELECT TO authenticated USING (user_id = auth.uid());
