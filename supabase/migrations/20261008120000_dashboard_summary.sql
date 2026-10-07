-- Resumo do Dashboard calculado NO BANCO (uma chamada), em vez de ~9 consultas em sequência no navegador.
--
-- Por quê: o Dashboard baixava milhares de lançamentos e rateios para somar no navegador (limites de
-- resposta, URLs gigantes com milhares de ids, lentidão e risco de divergência). Agora a função
-- dashboard_summary devolve prontos: KPIs, saldo, mês a mês, categorias, ranking por unidade, avisos
-- de vencimento e os totais do período anterior (para a variação).
--
-- As regras são as MESMAS do app (src/lib/finance.ts), portadas 1 a 1:
--  * valor do lançamento por unidade/frente com rateio (percentual ou valor), resíduo em "Sem unidade";
--  * pago conta se afeta_cashflow (por data de pagamento); provisionado, se afeta_dre (por competência);
--  * saldo = saldo inicial válido hoje + movimento pago POSTERIOR à data-base de cada conta;
--  * "contas em atraso" = pendentes/agendados com vencimento anterior a hoje.
-- A paridade com a lógica do app foi verificada com dados aleatórios (scripts/testes-sql).
--
-- SECURITY INVOKER: o RLS vale, quem não pode ler lançamentos não recebe números.
-- Só tem permissão de execução o papel authenticated (sem login a chamada é recusada).
-- O período é validado pelo app (data inicial anterior à final).
-- Idempotente (CREATE OR REPLACE / IF NOT EXISTS).

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
