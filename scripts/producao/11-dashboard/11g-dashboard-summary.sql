-- Dashboard, parte 7 de 7. Rode as partes em ordem (a, b, c...), uma por vez.
-- Resumo completo do Dashboard: junta as partes acima numa resposta só.
CREATE OR REPLACE FUNCTION public.dashboard_summary(
  p_from date,
  p_to date,
  p_unit uuid DEFAULT NULL,
  p_front uuid DEFAULT NULL,
  p_include_provisioned boolean DEFAULT false,
  p_today date DEFAULT current_date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT public.dash_kpis(p_from, p_to, p_unit, p_front, p_include_provisioned)
    || public.dash_balance(p_unit, p_front, p_today)
    || public.dash_alerts(p_unit, p_front, p_today)
    || jsonb_build_object(
      'monthly', public.dash_monthly(p_from, p_to, p_unit, p_front),
      'categoryData', public.dash_categories(p_from, p_to, p_unit, p_front, p_include_provisioned, 'despesa'),
      'receitaCategoryData', public.dash_categories(p_from, p_to, p_unit, p_front, p_include_provisioned, 'receita'),
      'unitRanking', public.dash_ranking(p_from, p_to, p_unit, p_front, p_include_provisioned))
$$;

REVOKE ALL ON FUNCTION public.dashboard_summary(date, date, uuid, uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(date, date, uuid, uuid, boolean, date) TO authenticated;
