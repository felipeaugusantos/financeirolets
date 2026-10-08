-- Dashboard por competência, parte 1: linhas pelo mês de competência (igual ao DRE).
CREATE OR REPLACE FUNCTION public.dash_rows_comp(p_from date, p_to date, p_unit uuid, p_front uuid)
RETURNS TABLE (
  id uuid, type public.transaction_type, total numeric, payment_date date, competence_date date,
  category_id uuid, unit_id uuid, val numeric, pip boolean, vip boolean, pipv boolean, vipv boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT v.id, v.type, v.total, v.competence_date AS payment_date, v.competence_date, v.category_id, v.unit_id, v.val,
    (v.competence_date BETWEEN p_from AND p_to),
    false,
    (v.competence_date BETWEEN (p_from - (p_to - p_from + 1)) AND (p_from - 1)),
    false
  FROM (
    SELECT t.id, t.type, COALESCE(t.net_amount, 0) AS total, t.competence_date, t.category_id, t.unit_id,
           public.dash_filtered_value(t.id, COALESCE(t.net_amount, 0), t.unit_id, t.front_id, p_unit, p_front) AS val
    FROM public.transactions t
    WHERE t.status <> 'cancelado'
      AND t.affects_dre IS DISTINCT FROM false
      AND t.competence_date BETWEEN (p_from - (p_to - p_from + 1)) AND p_to
  ) v
  WHERE NOT ((p_unit IS NOT NULL OR p_front IS NOT NULL) AND v.val = 0)
$$;
REVOKE ALL ON FUNCTION public.dash_rows_comp(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_rows_comp(date, date, uuid, uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.dash_kpis_comp(p_from date, p_to date, p_unit uuid, p_front uuid, p_prov boolean)
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
  FROM public.dash_rows_comp(p_from, p_to, p_unit, p_front) r
$$;

REVOKE ALL ON FUNCTION public.dash_kpis_comp(date, date, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_kpis_comp(date, date, uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.dash_monthly_comp(p_from date, p_to date, p_unit uuid, p_front uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH rr AS MATERIALIZED (SELECT * FROM public.dash_rows_comp(p_from, p_to, p_unit, p_front)),
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

REVOKE ALL ON FUNCTION public.dash_monthly_comp(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_monthly_comp(date, date, uuid, uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.dash_categories_comp(p_from date, p_to date, p_unit uuid, p_front uuid, p_prov boolean, p_type text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', COALESCE(c.name, CASE WHEN x.category_id IS NULL THEN 'Sem Categoria' ELSE 'Outro' END),
    'value', x.v)), '[]'::jsonb)
  FROM (
    SELECT r.category_id, sum(r.val) AS v
    FROM public.dash_rows_comp(p_from, p_to, p_unit, p_front) r
    WHERE r.type::text = p_type AND (r.pip OR (p_prov AND r.vip))
    GROUP BY r.category_id
  ) x
  LEFT JOIN public.categories c ON c.id = x.category_id
$$;

REVOKE ALL ON FUNCTION public.dash_categories_comp(date, date, uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_categories_comp(date, date, uuid, uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dash_ranking_comp(p_from date, p_to date, p_unit uuid, p_front uuid, p_prov boolean)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'unitId', COALESCE(k.unit_id::text, '__none__'),
    'unitName', CASE WHEN k.unit_id IS NULL THEN 'Sem unidade' ELSE COALESCE(u.name, 'Desconhecida') END,
    'despesas', k.despesas, 'receitas', k.receitas) ORDER BY k.despesas DESC, k.unit_id), '[]'::jsonb)
  FROM (
    SELECT s.unit_id,
           COALESCE(sum(s.value) FILTER (WHERE r.type = 'despesa'), 0) AS despesas,
           COALESCE(sum(s.value) FILTER (WHERE r.type = 'receita'), 0) AS receitas
    FROM public.dash_rows_comp(p_from, p_to, p_unit, p_front) r
    CROSS JOIN LATERAL public.dash_split_by_unit(r.id, r.total, r.unit_id) s
    WHERE (r.pip OR (p_prov AND r.vip))
      AND (p_front IS NULL OR r.val <> 0)
      AND s.value <> 0
      AND (p_unit IS NULL OR s.unit_id = p_unit)
    GROUP BY s.unit_id
  ) k
  LEFT JOIN public.units u ON u.id = k.unit_id
$$;

REVOKE ALL ON FUNCTION public.dash_ranking_comp(date, date, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_ranking_comp(date, date, uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_summary_comp(
  p_from date, p_to date, p_unit uuid DEFAULT NULL, p_front uuid DEFAULT NULL, p_today date DEFAULT current_date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT public.dash_kpis_comp(p_from, p_to, p_unit, p_front, false)
    || public.dash_balance(p_unit, p_front, p_today)
    || public.dash_alerts(p_unit, p_front, p_today)
    || jsonb_build_object(
      'monthly', public.dash_monthly_comp(p_from, p_to, p_unit, p_front),
      'categoryData', public.dash_categories_comp(p_from, p_to, p_unit, p_front, false, 'despesa'),
      'receitaCategoryData', public.dash_categories_comp(p_from, p_to, p_unit, p_front, false, 'receita'),
      'unitRanking', public.dash_ranking_comp(p_from, p_to, p_unit, p_front, false))
$$;
REVOKE ALL ON FUNCTION public.dashboard_summary_comp(date, date, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary_comp(date, date, uuid, uuid, date) TO authenticated;
