-- Dashboard, parte 6 de 7. Rode as partes em ordem (a, b, c...), uma por vez.
-- Saldo: movimento pago posterior à data-base de cada conta + saldos iniciais válidos hoje.
CREATE OR REPLACE FUNCTION public.dash_balance(p_unit uuid, p_front uuid, p_today date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'movimentacaoCalculada', (
      SELECT COALESCE(sum(CASE WHEN q.type = 'receita' THEN q.val ELSE -q.val END), 0)
      FROM (
        SELECT t.type, public.dash_filtered_value(t.id, COALESCE(t.net_amount, 0), t.unit_id, t.front_id, p_unit, p_front) AS val
        FROM public.transactions t
        LEFT JOIN public.accounts a ON a.id = t.account_id AND a.active
        WHERE t.status IN ('pago', 'recebido')
          AND t.affects_cashflow = true
          AND (a.initial_balance_date IS NULL OR t.payment_date IS NULL OR t.payment_date > a.initial_balance_date)
      ) q
    ),
    'saldoInicialTotal', CASE WHEN p_unit IS NOT NULL OR p_front IS NOT NULL THEN 0 ELSE (
      SELECT COALESCE(sum(COALESCE(x.initial_balance, 0)), 0) FROM public.accounts x
      WHERE x.active AND COALESCE(x.initial_balance, 0) <> 0 AND (x.initial_balance_date IS NULL OR x.initial_balance_date <= p_today)
    ) END,
    'saldoInicialConfigurado', CASE WHEN p_unit IS NOT NULL OR p_front IS NOT NULL THEN false ELSE EXISTS (
      SELECT 1 FROM public.accounts x
      WHERE x.active AND COALESCE(x.initial_balance, 0) <> 0 AND (x.initial_balance_date IS NULL OR x.initial_balance_date <= p_today)
    ) END
  )
$$;

REVOKE ALL ON FUNCTION public.dash_balance(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_balance(uuid, uuid, date) TO authenticated;

-- Avisos: contas vencidas e que vencem hoje (pendentes/agendadas).
CREATE OR REPLACE FUNCTION public.dash_alerts(p_unit uuid, p_front uuid, p_today date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH al AS (
    SELECT t.id, t.description, t.net_amount, t.due_date, t.type, pr.name AS partner_name
    FROM public.transactions t
    LEFT JOIN public.partners pr ON pr.id = t.partner_id
    WHERE t.status IN ('pendente', 'agendado')
      AND t.due_date IS NOT NULL AND t.due_date <= p_today
      AND ((p_unit IS NULL AND p_front IS NULL)
        OR public.dash_filtered_value(t.id, COALESCE(t.net_amount, 0), t.unit_id, t.front_id, p_unit, p_front) <> 0)
    ORDER BY t.due_date, t.id
    LIMIT 1000
  )
  SELECT jsonb_build_object(
    'overdueBills', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', al.id, 'description', al.description, 'net_amount', al.net_amount, 'due_date', al.due_date,
        'type', al.type, 'partner_name', al.partner_name) ORDER BY al.due_date, al.id), '[]'::jsonb)
      FROM al WHERE al.due_date < p_today),
    'dueTodayBills', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', al.id, 'description', al.description, 'net_amount', al.net_amount, 'due_date', al.due_date,
        'type', al.type, 'partner_name', al.partner_name) ORDER BY al.id), '[]'::jsonb)
      FROM al WHERE al.due_date = p_today)
  )
$$;

REVOKE ALL ON FUNCTION public.dash_alerts(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_alerts(uuid, uuid, date) TO authenticated;
