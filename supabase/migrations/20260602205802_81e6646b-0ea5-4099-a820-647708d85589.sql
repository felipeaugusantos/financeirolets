
-- Add context column to audit_logs to distinguish reconciliation fixes
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS context text;
CREATE INDEX IF NOT EXISTS idx_audit_logs_context_created ON public.audit_logs (context, created_at DESC);

-- Security-definer function to log reconciliation fixes (bypasses audit_logs RLS safely)
CREATE OR REPLACE FUNCTION public.log_reconciliation_fix(
  _record_id uuid,
  _old_data jsonb,
  _new_data jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.audit_logs(table_name, record_id, action, old_data, new_data, user_id, context)
  VALUES ('transactions', _record_id, 'RECONCILIATION_FIX', _old_data, _new_data, auth.uid(), 'reconciliation')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_reconciliation_fix(uuid, jsonb, jsonb) TO authenticated;

-- Allow admin and financeiro to read reconciliation audit entries (admins already could; widen for financeiro)
DROP POLICY IF EXISTS "Admin/financeiro can read reconciliation audit" ON public.audit_logs;
CREATE POLICY "Admin/financeiro can read reconciliation audit"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  context = 'reconciliation'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
);
