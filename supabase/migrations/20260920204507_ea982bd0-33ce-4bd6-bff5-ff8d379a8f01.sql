CREATE TABLE IF NOT EXISTS public.closed_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  note text,
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closed_periods TO authenticated;
GRANT ALL ON public.closed_periods TO service_role;

ALTER TABLE public.closed_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read closed periods" ON public.closed_periods;
CREATE POLICY "Authenticated can read closed periods" ON public.closed_periods
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin or fin can close period" ON public.closed_periods;
CREATE POLICY "Admin or fin can close period" ON public.closed_periods
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "Admin can update closed period" ON public.closed_periods;
CREATE POLICY "Admin can update closed period" ON public.closed_periods
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin can reopen period" ON public.closed_periods;
CREATE POLICY "Admin can reopen period" ON public.closed_periods
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_closed_periods_updated_at ON public.closed_periods;
CREATE TRIGGER update_closed_periods_updated_at
  BEFORE UPDATE ON public.closed_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.is_period_closed(_d date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _d IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.closed_periods cp
    WHERE cp.year = EXTRACT(YEAR FROM _d)::int
      AND cp.month = EXTRACT(MONTH FROM _d)::int
  )
$$;

CREATE OR REPLACE FUNCTION public.block_closed_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.is_period_closed(OLD.competence_date) THEN
      RAISE EXCEPTION 'Mês % está fechado. Reabra o período para alterar lançamentos.', to_char(OLD.competence_date, 'MM/YYYY');
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND public.is_period_closed(OLD.competence_date) THEN
    RAISE EXCEPTION 'Mês % está fechado. Reabra o período para alterar lançamentos.', to_char(OLD.competence_date, 'MM/YYYY');
  END IF;

  d := NEW.competence_date;
  IF public.is_period_closed(d) THEN
    RAISE EXCEPTION 'Mês % está fechado. Reabra o período para registrar lançamentos.', to_char(d, 'MM/YYYY');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_closed_period_transactions ON public.transactions;
CREATE TRIGGER block_closed_period_transactions
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.block_closed_period();