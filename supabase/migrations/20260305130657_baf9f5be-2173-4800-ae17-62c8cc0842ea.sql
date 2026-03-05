
-- 1. Create attachments storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);

-- 2. Storage RLS policies
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Anyone can read attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'attachments');

CREATE POLICY "Authenticated users can delete own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'attachments');

-- 3. Fix RESTRICTIVE policies on transactions table
DROP POLICY IF EXISTS "Admins can manage transactions" ON public.transactions;
DROP POLICY IF EXISTS "Auth users can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Auth users can read transactions" ON public.transactions;

CREATE POLICY "Auth users can read transactions" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/financeiro can manage transactions" ON public.transactions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
CREATE POLICY "Auth users can insert own transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Auth users can update own transactions" ON public.transactions FOR UPDATE TO authenticated USING (created_by = auth.uid());

-- 4. Fix RESTRICTIVE policies on attachments table
DROP POLICY IF EXISTS "Auth users can insert attachments" ON public.attachments;
DROP POLICY IF EXISTS "Auth users can read attachments" ON public.attachments;
DROP POLICY IF EXISTS "Admins can manage attachments" ON public.attachments;

CREATE POLICY "Auth users can read attachments" ON public.attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage attachments" ON public.attachments FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Auth users can insert attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

-- 5. Fix RESTRICTIVE policies on transaction_allocations table
DROP POLICY IF EXISTS "Admins can manage allocations" ON public.transaction_allocations;
DROP POLICY IF EXISTS "Auth users can read allocations" ON public.transaction_allocations;

CREATE POLICY "Auth users can read allocations" ON public.transaction_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/financeiro can manage allocations" ON public.transaction_allocations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));
