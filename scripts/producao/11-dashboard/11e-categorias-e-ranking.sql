-- Dashboard, parte 5 de 7. Rode as partes em ordem (a, b, c...), uma por vez.
-- Valor por categoria (p_type = 'despesa' ou 'receita').
CREATE OR REPLACE FUNCTION public.dash_categories(p_from date, p_to date, p_unit uuid, p_front uuid, p_prov boolean, p_type text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', COALESCE(c.name, CASE WHEN x.category_id IS NULL THEN 'Sem Categoria' ELSE 'Outro' END),
    'value', x.v)), '[]'::jsonb)
  FROM (
    SELECT r.category_id, sum(r.val) AS v
    FROM public.dash_rows(p_from, p_to, p_unit, p_front) r
    WHERE r.type::text = p_type AND (r.pip OR (p_prov AND r.vip))
    GROUP BY r.category_id
  ) x
  LEFT JOIN public.categories c ON c.id = x.category_id
$$;

REVOKE ALL ON FUNCTION public.dash_categories(date, date, uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_categories(date, date, uuid, uuid, boolean, text) TO authenticated;

-- Ranking por unidade (com rateio): despesas e receitas.
CREATE OR REPLACE FUNCTION public.dash_ranking(p_from date, p_to date, p_unit uuid, p_front uuid, p_prov boolean)
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
    FROM public.dash_rows(p_from, p_to, p_unit, p_front) r
    CROSS JOIN LATERAL public.dash_split_by_unit(r.id, r.total, r.unit_id) s
    WHERE (r.pip OR (p_prov AND r.vip))
      AND (p_front IS NULL OR r.val <> 0)
      AND s.value <> 0
      AND (p_unit IS NULL OR s.unit_id = p_unit)
    GROUP BY s.unit_id
  ) k
  LEFT JOIN public.units u ON u.id = k.unit_id
$$;

REVOKE ALL ON FUNCTION public.dash_ranking(date, date, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_ranking(date, date, uuid, uuid, boolean) TO authenticated;
