-- Dashboard, parte 3 de 7. Rode as partes em ordem (a, b, c...), uma por vez.
-- Linhas do período (e do anterior) já com o valor atribuível aos filtros e as marcas pago/provisionado.
CREATE OR REPLACE FUNCTION public.dash_rows(p_from date, p_to date, p_unit uuid, p_front uuid)
RETURNS TABLE (
  id uuid, type public.transaction_type, total numeric, payment_date date, competence_date date,
  category_id uuid, unit_id uuid, val numeric, pip boolean, vip boolean, pipv boolean, vipv boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT v.id, v.type, v.total, v.payment_date, v.competence_date, v.category_id, v.unit_id, v.val,
    COALESCE(v.is_paid AND v.a_cash AND v.payment_date BETWEEN p_from AND p_to, false),
    COALESCE(v.is_prov AND v.a_dre AND v.competence_date BETWEEN p_from AND p_to, false),
    COALESCE(v.is_paid AND v.a_cash AND v.payment_date BETWEEN (p_from - (p_to - p_from + 1)) AND (p_from - 1), false),
    COALESCE(v.is_prov AND v.a_dre AND v.competence_date BETWEEN (p_from - (p_to - p_from + 1)) AND (p_from - 1), false)
  FROM (
    SELECT t.id, t.type, COALESCE(t.net_amount, 0) AS total, t.payment_date, t.competence_date,
           t.category_id, t.unit_id,
           public.dash_filtered_value(t.id, COALESCE(t.net_amount, 0), t.unit_id, t.front_id, p_unit, p_front) AS val,
           (t.status IN ('pago', 'recebido')) AS is_paid,
           (t.status IN ('pendente', 'agendado')) AS is_prov,
           (t.affects_cashflow IS DISTINCT FROM false) AS a_cash,
           (t.affects_dre IS DISTINCT FROM false) AS a_dre
    FROM public.transactions t
    WHERE t.status <> 'cancelado'
      AND ((t.competence_date BETWEEN (p_from - (p_to - p_from + 1)) AND p_to)
        OR (t.payment_date BETWEEN (p_from - (p_to - p_from + 1)) AND p_to))
  ) v
  WHERE NOT ((p_unit IS NOT NULL OR p_front IS NOT NULL) AND v.val = 0)
$$;

REVOKE ALL ON FUNCTION public.dash_rows(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_rows(date, date, uuid, uuid) TO authenticated;
