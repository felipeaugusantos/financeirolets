DROP POLICY IF EXISTS "Admin/financeiro can read transactions audit" ON public.audit_logs;
CREATE POLICY "Admin/financeiro can read transactions audit"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (context = 'transactions' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)));