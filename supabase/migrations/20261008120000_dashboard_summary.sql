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
-- SECURITY INVOKER: o RLS vale (quem não pode ler lançamentos não recebe números).
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

CREATE OR REPLACE FUNCTION public.dashboard_summary(
  p_from date,
  p_to date,
  p_unit uuid DEFAULT NULL,
  p_front uuid DEFAULT NULL,
  p_include_provisioned boolean DEFAULT false,
  p_today date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_ps date;                         -- início do período anterior (mesma duração)
  v_pe date;                         -- fim do período anterior
  v_filtered boolean := p_unit IS NOT NULL OR p_front IS NOT NULL;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'invalid_period: informe um período válido' USING ERRCODE = 'P0001';
  END IF;
  v_ps := p_from - (p_to - p_from + 1);
  v_pe := p_from - 1;

  WITH
  base AS MATERIALIZED (
    SELECT t.id, t.type, COALESCE(t.net_amount, 0) AS total, t.status, t.payment_date, t.competence_date,
           t.category_id, t.unit_id, t.front_id,
           (t.status IN ('pago', 'recebido')) AS is_paid,
           (t.status IN ('pendente', 'agendado')) AS is_prov,
           (t.affects_cashflow IS DISTINCT FROM false) AS a_cash,
           (t.affects_dre IS DISTINCT FROM false) AS a_dre
    FROM public.transactions t
    WHERE t.status <> 'cancelado'
      AND ((t.competence_date BETWEEN v_ps AND p_to) OR (t.payment_date BETWEEN v_ps AND p_to))
  ),
  valued AS MATERIALIZED (
    SELECT b.*, public.dash_filtered_value(b.id, b.total, b.unit_id, b.front_id, p_unit, p_front) AS val
    FROM base b
  ),
  rws AS MATERIALIZED (
    SELECT v.*,
      COALESCE(v.is_paid AND v.a_cash AND v.payment_date BETWEEN p_from AND p_to, false)    AS pip,
      COALESCE(v.is_prov AND v.a_dre AND v.competence_date BETWEEN p_from AND p_to, false)  AS vip,
      COALESCE(v.is_paid AND v.a_cash AND v.payment_date BETWEEN v_ps AND v_pe, false)      AS pipv,
      COALESCE(v.is_prov AND v.a_dre AND v.competence_date BETWEEN v_ps AND v_pe, false)    AS vipv
    FROM valued v
    WHERE NOT (v_filtered AND v.val = 0)
  ),
  k AS (
    SELECT
      COALESCE(sum(val) FILTER (WHERE pip AND type = 'receita'), 0) AS receitas,
      COALESCE(sum(val) FILTER (WHERE pip AND type = 'despesa'), 0) AS despesas,
      COALESCE(sum(val) FILTER (WHERE vip AND type = 'receita'), 0) AS receitas_prov,
      COALESCE(sum(val) FILTER (WHERE vip AND type = 'despesa'), 0) AS despesas_prov,
      COALESCE(sum(val) FILTER (WHERE pipv AND type = 'receita'), 0)
        + CASE WHEN p_include_provisioned THEN COALESCE(sum(val) FILTER (WHERE vipv AND type = 'receita'), 0) ELSE 0 END AS prev_receitas,
      COALESCE(sum(val) FILTER (WHERE pipv AND type = 'despesa'), 0)
        + CASE WHEN p_include_provisioned THEN COALESCE(sum(val) FILTER (WHERE vipv AND type = 'despesa'), 0) ELSE 0 END AS prev_despesas,
      count(*) FILTER (WHERE (pip OR vip) AND category_id IS NULL) AS sem_categoria,
      count(*) FILTER (WHERE (pip OR vip) AND category_id IS NULL AND type = 'receita') AS sem_categoria_receita,
      count(*) FILTER (WHERE (pip OR vip) AND category_id IS NULL AND type = 'despesa') AS sem_categoria_despesa,
      count(*) FILTER (
        WHERE (pip OR vip) AND unit_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.transaction_allocations a WHERE a.transaction_id = rws.id AND a.unit_id IS NOT NULL)
      ) AS sem_unidade
    FROM rws
  ),
  months AS (
    SELECT to_char(m, 'YYYY-MM') AS ym
    FROM generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month') m
    LIMIT 24
  ),
  paid_m AS (
    SELECT to_char(payment_date, 'YYYY-MM') AS ym,
           COALESCE(sum(val) FILTER (WHERE type = 'receita'), 0) AS r,
           COALESCE(sum(val) FILTER (WHERE type = 'despesa'), 0) AS d
    FROM rws WHERE pip GROUP BY 1
  ),
  prov_m AS (
    SELECT to_char(competence_date, 'YYYY-MM') AS ym,
           COALESCE(sum(val) FILTER (WHERE type = 'receita'), 0) AS r,
           COALESCE(sum(val) FILTER (WHERE type = 'despesa'), 0) AS d
    FROM rws WHERE vip GROUP BY 1
  ),
  monthly AS (
    SELECT mo.ym, COALESCE(p.r, 0) AS receitas, COALESCE(p.d, 0) AS despesas,
           COALESCE(v.r, 0) AS receitas_prov, COALESCE(v.d, 0) AS despesas_prov
    FROM months mo LEFT JOIN paid_m p USING (ym) LEFT JOIN prov_m v USING (ym)
  ),
  cat AS (
    SELECT type, category_id, sum(val) AS v
    FROM rws
    WHERE pip OR (p_include_provisioned AND vip)
    GROUP BY type, category_id
  ),
  rk_parts AS (
    SELECT r.type, s.unit_id, s.value
    FROM rws r
    CROSS JOIN LATERAL public.dash_split_by_unit(r.id, r.total, r.unit_id) s
    WHERE (r.pip OR (p_include_provisioned AND r.vip))
      AND (p_front IS NULL OR r.val <> 0)
      AND s.value <> 0
      AND (p_unit IS NULL OR s.unit_id = p_unit)
  ),
  rk AS (
    SELECT unit_id,
           COALESCE(sum(value) FILTER (WHERE type = 'despesa'), 0) AS despesas,
           COALESCE(sum(value) FILTER (WHERE type = 'receita'), 0) AS receitas
    FROM rk_parts GROUP BY unit_id
  ),
  pa AS (
    -- saldo: pagos que afetam o caixa, só os POSTERIORES à data-base da conta (regra isAfterOpening)
    SELECT t.id, t.type, COALESCE(t.net_amount, 0) AS total, t.unit_id, t.front_id
    FROM public.transactions t
    LEFT JOIN public.accounts a ON a.id = t.account_id AND a.active
    WHERE t.status IN ('pago', 'recebido')
      AND t.affects_cashflow = true
      AND (a.initial_balance_date IS NULL OR t.payment_date IS NULL OR t.payment_date > a.initial_balance_date)
  ),
  mov AS (
    SELECT COALESCE(sum(CASE WHEN type = 'receita' THEN val ELSE -val END), 0) AS m
    FROM (SELECT type, public.dash_filtered_value(id, total, unit_id, front_id, p_unit, p_front) AS val FROM pa) q
  ),
  op AS (
    SELECT COALESCE(sum(COALESCE(initial_balance, 0)) FILTER (
             WHERE COALESCE(initial_balance, 0) <> 0 AND (initial_balance_date IS NULL OR initial_balance_date <= p_today)), 0) AS total,
           COALESCE(bool_or(COALESCE(initial_balance, 0) <> 0 AND (initial_balance_date IS NULL OR initial_balance_date <= p_today)), false) AS configured
    FROM public.accounts WHERE active
  ),
  al AS (
    SELECT t.id, t.description, t.net_amount, t.due_date, t.type, pr.name AS partner_name
    FROM public.transactions t
    LEFT JOIN public.partners pr ON pr.id = t.partner_id
    WHERE t.status IN ('pendente', 'agendado')
      AND t.due_date IS NOT NULL AND t.due_date <= p_today
      AND (NOT v_filtered OR public.dash_filtered_value(t.id, COALESCE(t.net_amount, 0), t.unit_id, t.front_id, p_unit, p_front) <> 0)
    ORDER BY t.due_date, t.id
    LIMIT 1000
  )
  SELECT jsonb_build_object(
    'movimentacaoCalculada', (SELECT m FROM mov),
    'saldoInicialTotal', CASE WHEN v_filtered THEN 0 ELSE (SELECT total FROM op) END,
    'saldoInicialConfigurado', CASE WHEN v_filtered THEN false ELSE (SELECT configured FROM op) END,
    'receitas', k.receitas, 'despesas', k.despesas,
    'receitasProvisionadas', k.receitas_prov, 'despesasProvisionadas', k.despesas_prov,
    'prevReceitas', k.prev_receitas, 'prevDespesas', k.prev_despesas,
    'semCategoria', k.sem_categoria, 'semCategoriaReceita', k.sem_categoria_receita,
    'semCategoriaDespesa', k.sem_categoria_despesa, 'semUnidade', k.sem_unidade,
    'monthly', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'month', ym, 'receitas', receitas, 'despesas', despesas,
        'receitasProv', receitas_prov, 'despesasProv', despesas_prov) ORDER BY ym), '[]'::jsonb) FROM monthly),
    'categoryData', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', COALESCE(c.name, CASE WHEN cat.category_id IS NULL THEN 'Sem Categoria' ELSE 'Outro' END),
        'value', cat.v)), '[]'::jsonb)
      FROM cat LEFT JOIN public.categories c ON c.id = cat.category_id WHERE cat.type = 'despesa'),
    'receitaCategoryData', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', COALESCE(c.name, CASE WHEN cat.category_id IS NULL THEN 'Sem Categoria' ELSE 'Outro' END),
        'value', cat.v)), '[]'::jsonb)
      FROM cat LEFT JOIN public.categories c ON c.id = cat.category_id WHERE cat.type = 'receita'),
    'unitRanking', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'unitId', COALESCE(rk.unit_id::text, '__none__'),
        'unitName', CASE WHEN rk.unit_id IS NULL THEN 'Sem unidade' ELSE COALESCE(u.name, 'Desconhecida') END,
        'despesas', rk.despesas, 'receitas', rk.receitas) ORDER BY rk.despesas DESC, rk.unit_id), '[]'::jsonb)
      FROM rk LEFT JOIN public.units u ON u.id = rk.unit_id),
    'overdueBills', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'description', description, 'net_amount', net_amount, 'due_date', due_date,
        'type', type, 'partner_name', partner_name) ORDER BY due_date, id), '[]'::jsonb)
      FROM al WHERE due_date < p_today),
    'dueTodayBills', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'description', description, 'net_amount', net_amount, 'due_date', due_date,
        'type', type, 'partner_name', partner_name) ORDER BY id), '[]'::jsonb)
      FROM al WHERE due_date = p_today)
  ) INTO v_result
  FROM k;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dash_filtered_value(uuid, numeric, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dash_split_by_unit(uuid, numeric, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dashboard_summary(date, date, uuid, uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_filtered_value(uuid, numeric, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dash_split_by_unit(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(date, date, uuid, uuid, boolean, date) TO authenticated;
