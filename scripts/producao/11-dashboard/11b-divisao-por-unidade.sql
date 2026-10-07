-- Dashboard, parte 2 de 7. Rode as partes em ordem (a, b, c...), uma por vez.
-- Distribui o valor do lançamento entre unidades (igual a splitByUnit); unit_id NULL = "Sem unidade".
CREATE OR REPLACE FUNCTION public.dash_split_by_unit(p_tx uuid, p_total numeric, p_tx_unit uuid)
RETURNS TABLE (unit_id uuid, value numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH parts AS (
    SELECT a.unit_id AS u,
           CASE WHEN a.allocation_type = 'percentual' AND a.percentage IS NOT NULL
                THEN p_total * (a.percentage / 100) ELSE COALESCE(a.amount, 0) END AS v
    FROM public.transaction_allocations a
    WHERE a.transaction_id = p_tx
  ),
  agg AS (SELECT count(*) AS n, COALESCE(sum(v), 0) AS allocated FROM parts)
  SELECT p.u, p.v FROM parts p
  UNION ALL
  SELECT NULL::uuid, p_total - agg.allocated FROM agg WHERE agg.n > 0 AND abs(p_total - agg.allocated) > 0.005
  UNION ALL
  SELECT p_tx_unit, p_total FROM agg WHERE agg.n = 0
$$;

REVOKE ALL ON FUNCTION public.dash_split_by_unit(uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_split_by_unit(uuid, numeric, uuid) TO authenticated;
