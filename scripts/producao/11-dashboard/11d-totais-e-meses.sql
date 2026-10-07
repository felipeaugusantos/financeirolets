-- Dashboard, parte 4 de 7. Rode as partes em ordem (a, b, c...), uma por vez.
-- Totais do período, do período anterior e contagens de dados incompletos.
CREATE OR REPLACE FUNCTION public.dash_kpis(p_from date, p_to date, p_unit uuid, p_front uuid, p_prov boolean)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'receitas', COALESCE(sum(r.val) FILTER (WHERE r.pip AND r.type = 'receita'), 0),
    'despesas', COALESCE(sum(r.val) FILTER (WHERE r.pip AND r.type = 'despesa'), 0),
    'receitasProvisionadas', COALESCE(sum(r.val) FILTER (WHERE r.vip AND r.type = 'receita'), 0),
    'despesasProvisionadas', COALESCE(sum(r.val) FILTER (WHERE r.vip AND r.type = 'despesa'), 0),
    'prevReceitas', COALESCE(sum(r.val) FILTER (WHERE (r.pipv OR (p_prov AND r.vipv)) AND r.type = 'receita'), 0),
    'prevDespesas', COALESCE(sum(r.val) FILTER (WHERE (r.pipv OR (p_prov AND r.vipv)) AND r.type = 'despesa'), 0),
    'semCategoria', count(*) FILTER (WHERE (r.pip OR r.vip) AND r.category_id IS NULL),
    'semCategoriaReceita', count(*) FILTER (WHERE (r.pip OR r.vip) AND r.category_id IS NULL AND r.type = 'receita'),
    'semCategoriaDespesa', count(*) FILTER (WHERE (r.pip OR r.vip) AND r.category_id IS NULL AND r.type = 'despesa'),
    'semUnidade', count(*) FILTER (
      WHERE (r.pip OR r.vip) AND r.unit_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.transaction_allocations a WHERE a.transaction_id = r.id AND a.unit_id IS NOT NULL))
  )
  FROM public.dash_rows(p_from, p_to, p_unit, p_front) r
$$;

REVOKE ALL ON FUNCTION public.dash_kpis(date, date, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_kpis(date, date, uuid, uuid, boolean) TO authenticated;

-- Mês a mês (até 24 meses): pago por data de pagamento, provisionado por competência.
CREATE OR REPLACE FUNCTION public.dash_monthly(p_from date, p_to date, p_unit uuid, p_front uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH rr AS MATERIALIZED (SELECT * FROM public.dash_rows(p_from, p_to, p_unit, p_front)),
  months AS (
    SELECT to_char(m, 'YYYY-MM') AS ym
    FROM generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month') m
    LIMIT 24
  ),
  paid_m AS (
    SELECT to_char(rr.payment_date, 'YYYY-MM') AS ym,
           COALESCE(sum(rr.val) FILTER (WHERE rr.type = 'receita'), 0) AS r,
           COALESCE(sum(rr.val) FILTER (WHERE rr.type = 'despesa'), 0) AS d
    FROM rr WHERE rr.pip GROUP BY 1
  ),
  prov_m AS (
    SELECT to_char(rr.competence_date, 'YYYY-MM') AS ym,
           COALESCE(sum(rr.val) FILTER (WHERE rr.type = 'receita'), 0) AS r,
           COALESCE(sum(rr.val) FILTER (WHERE rr.type = 'despesa'), 0) AS d
    FROM rr WHERE rr.vip GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'month', mo.ym, 'receitas', COALESCE(p.r, 0), 'despesas', COALESCE(p.d, 0),
    'receitasProv', COALESCE(v.r, 0), 'despesasProv', COALESCE(v.d, 0)) ORDER BY mo.ym), '[]'::jsonb)
  FROM months mo LEFT JOIN paid_m p USING (ym) LEFT JOIN prov_m v USING (ym)
$$;

REVOKE ALL ON FUNCTION public.dash_monthly(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_monthly(date, date, uuid, uuid) TO authenticated;
