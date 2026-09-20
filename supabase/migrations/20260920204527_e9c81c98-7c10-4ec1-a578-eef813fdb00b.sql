CREATE OR REPLACE FUNCTION public.is_period_closed(_d date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT _d IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.closed_periods cp
    WHERE cp.year = EXTRACT(YEAR FROM _d)::int
      AND cp.month = EXTRACT(MONTH FROM _d)::int
  )
$$;

REVOKE ALL ON FUNCTION public.block_closed_period() FROM PUBLIC, anon, authenticated;