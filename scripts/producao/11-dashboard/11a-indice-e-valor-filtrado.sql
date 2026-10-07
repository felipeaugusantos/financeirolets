-- Dashboard, parte 1 de 7. Rode as partes em ordem (a, b, c...), uma por vez.
CREATE INDEX IF NOT EXISTS idx_transaction_allocations_transaction_id
  ON public.transaction_allocations (transaction_id);

-- Valor do lançamento atribuível ao filtro unidade x frente (igual a valueForFilters).
CREATE OR REPLACE FUNCTION public.dash_filtered_value(
  p_tx uuid, p_total numeric, p_tx_unit uuid, p_tx_front uuid, p_unit uuid, p_front uuid
) RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT CASE
    WHEN p_unit IS NULL AND p_front IS NULL THEN p_total
    WHEN s.n > 0 THEN
      s.matched + CASE
        WHEN abs(p_total - s.allocated) > 0.005 AND p_unit IS NULL
             AND (p_front IS NULL OR p_tx_front = p_front)
        THEN p_total - s.allocated ELSE 0 END
    WHEN (p_unit IS NULL OR p_tx_unit = p_unit) AND (p_front IS NULL OR p_tx_front = p_front) THEN p_total
    ELSE 0
  END
  FROM (
    SELECT count(*) AS n,
           COALESCE(sum(x.v), 0) AS allocated,
           COALESCE(sum(x.v) FILTER (
             WHERE (p_unit IS NULL OR x.unit_id = p_unit)
               AND (p_front IS NULL OR COALESCE(x.front_id, p_tx_front) = p_front)
           ), 0) AS matched
    FROM (
      SELECT a.unit_id, a.front_id,
             CASE WHEN a.allocation_type = 'percentual' AND a.percentage IS NOT NULL
                  THEN p_total * (a.percentage / 100) ELSE COALESCE(a.amount, 0) END AS v
      FROM public.transaction_allocations a
      WHERE a.transaction_id = p_tx
    ) x
  ) s
$$;

REVOKE ALL ON FUNCTION public.dash_filtered_value(uuid, numeric, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_filtered_value(uuid, numeric, uuid, uuid, uuid, uuid) TO authenticated;
