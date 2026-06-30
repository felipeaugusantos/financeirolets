
CREATE OR REPLACE FUNCTION public.log_transaction_action(
  _record_id uuid,
  _action text,
  _old_data jsonb,
  _new_data jsonb,
  _context text DEFAULT 'transactions'
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
  IF _action NOT IN ('DELETE','UNDO_DELETE','REDO_DELETE') THEN
    RAISE EXCEPTION 'Invalid action: %', _action;
  END IF;
  INSERT INTO public.audit_logs(table_name, record_id, action, old_data, new_data, user_id, context)
  VALUES ('transactions', _record_id, _action, _old_data, _new_data, auth.uid(), COALESCE(_context, 'transactions'))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_transaction_action(uuid, text, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_transaction_action(uuid, text, jsonb, jsonb, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admin/financeiro can read transactions audit" ON public.audit_logs;
CREATE POLICY "Admin/financeiro can read transactions audit"
  ON public.audit_logs
  FOR SELECT
  USING (
    context = 'transactions'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  );
