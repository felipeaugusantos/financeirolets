-- Salvar e excluir lançamento de forma ATÔMICA (lançamento + rateio numa só transação).
--
-- Antes (useTransactions, no navegador):
--   * criar: insert dos lançamentos e, DEPOIS, insert do rateio em outra chamada. Se o rateio
--     falhava, o lançamento ficava sem rateio (o valor cai em "Sem unidade") e o usuário via só um aviso;
--   * editar: update do lançamento, delete de todo o rateio e insert do novo rateio, em três chamadas;
--   * excluir: apagava os anexos ANTES de saber se o banco aceitaria apagar o lançamento. Em mês
--     fechado o trigger recusa a exclusão e os anexos já tinham sido perdidos.
--
-- Agora cada operação é uma função: ou tudo acontece, ou nada.
-- SECURITY INVOKER: o RLS e o trigger de mês fechado continuam valendo (as funções não dão
-- permissão nova a ninguém). Idempotente (CREATE OR REPLACE).

-- 1) Criar um ou mais lançamentos (parcelas) e o rateio de cada um -------------------------
CREATE OR REPLACE FUNCTION public.create_transactions_with_allocations(
  p_rows jsonb,
  p_allocations jsonb DEFAULT '[]'::jsonb
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_elem jsonb;
  r public.transactions%ROWTYPE;
  v_id uuid;
  v_ids uuid[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'invalid_rows: informe ao menos um lançamento' USING ERRCODE = 'P0001';
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    r := jsonb_populate_record(NULL::public.transactions, v_elem);

    INSERT INTO public.transactions (
      type, description, status, payment_method, category_id, account_id, partner_id,
      unit_id, front_id, notes, created_by, affects_dre, affects_cashflow, card_sale_group_id,
      amount, tax_amount, net_amount, competence_date, due_date, payment_date,
      installment_group_id, installment_number, installment_total,
      is_recurring, recurrence_frequency, recurrence_end_date
    ) VALUES (
      r.type, r.description, r.status, r.payment_method, r.category_id, r.account_id, r.partner_id,
      r.unit_id, r.front_id, r.notes, coalesce(r.created_by, auth.uid()),
      coalesce(r.affects_dre, true), coalesce(r.affects_cashflow, true), r.card_sale_group_id,
      r.amount, coalesce(r.tax_amount, 0), r.net_amount, r.competence_date, r.due_date, r.payment_date,
      r.installment_group_id, r.installment_number, r.installment_total,
      coalesce(r.is_recurring, false), r.recurrence_frequency, r.recurrence_end_date
    ) RETURNING id INTO v_id;

    v_ids := v_ids || v_id;

    IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
      INSERT INTO public.transaction_allocations (
        transaction_id, unit_id, front_id, allocation_type, percentage, amount
      )
      SELECT v_id, a.unit_id, a.front_id, a.allocation_type, a.percentage, a.amount
      FROM jsonb_to_recordset(p_allocations) AS a(
        unit_id uuid, front_id uuid, allocation_type public.allocation_type,
        percentage numeric, amount numeric
      );
    END IF;
  END LOOP;

  RETURN v_ids;
END;
$$;

-- 2) Editar um lançamento e, se vier, trocar o rateio ---------------------------------------
-- p_patch: só as colunas que mudaram (as ausentes mantêm o valor atual; null explícito limpa).
-- p_allocations: NULL = não mexe no rateio; '[]' = remove o rateio; lista = substitui.
-- Sem rateio novo e com net_amount alterado, os rateios em R$ são reajustados na mesma
-- proporção, para o rateio continuar fechando com o valor do lançamento.
CREATE OR REPLACE FUNCTION public.update_transaction_with_allocations(
  p_id uuid,
  p_patch jsonb,
  p_allocations jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  o public.transactions%ROWTYPE;
  r public.transactions%ROWTYPE;
  v_rows int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO o FROM public.transactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found: lançamento inexistente ou sem permissão' USING ERRCODE = 'P0001';
  END IF;

  r := jsonb_populate_record(o, coalesce(p_patch, '{}'::jsonb));

  UPDATE public.transactions SET
    type = r.type, description = r.description,
    amount = r.amount, tax_amount = r.tax_amount, net_amount = r.net_amount,
    competence_date = r.competence_date, due_date = r.due_date, payment_date = r.payment_date,
    status = r.status, payment_method = r.payment_method,
    category_id = r.category_id, account_id = r.account_id, partner_id = r.partner_id,
    unit_id = r.unit_id, front_id = r.front_id, notes = r.notes,
    is_recurring = r.is_recurring, recurrence_frequency = r.recurrence_frequency,
    recurrence_end_date = r.recurrence_end_date,
    affects_dre = r.affects_dre, affects_cashflow = r.affects_cashflow
  WHERE id = p_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'transaction_not_found: lançamento inexistente ou sem permissão' USING ERRCODE = 'P0001';
  END IF;

  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
    DELETE FROM public.transaction_allocations WHERE transaction_id = p_id;
    INSERT INTO public.transaction_allocations (
      transaction_id, unit_id, front_id, allocation_type, percentage, amount
    )
    SELECT p_id, a.unit_id, a.front_id, a.allocation_type, a.percentage, a.amount
    FROM jsonb_to_recordset(p_allocations) AS a(
      unit_id uuid, front_id uuid, allocation_type public.allocation_type,
      percentage numeric, amount numeric
    );
  ELSIF coalesce(p_patch, '{}'::jsonb) ? 'net_amount'
        AND o.net_amount IS NOT NULL AND o.net_amount <> 0
        AND r.net_amount IS DISTINCT FROM o.net_amount THEN
    UPDATE public.transaction_allocations
    SET amount = round(amount * (r.net_amount / o.net_amount), 2)
    WHERE transaction_id = p_id AND allocation_type = 'valor' AND amount IS NOT NULL;
  END IF;
END;
$$;

-- 3) Excluir um lançamento com rateio e anexos -----------------------------------------------
-- Rateio e anexos saem junto (ON DELETE CASCADE) na mesma transação do lançamento: se o
-- trigger de mês fechado recusar a exclusão, nada é apagado. Devolve o que foi removido
-- ({row, allocations, attachments}) para o app poder desfazer.
CREATE OR REPLACE FUNCTION public.delete_transaction_with_children(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  t public.transactions%ROWTYPE;
  v_allocs jsonb;
  v_atts jsonb;
  v_rows int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO t FROM public.transactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found: lançamento inexistente ou sem permissão' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_allocs
  FROM public.transaction_allocations a WHERE a.transaction_id = p_id;
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_atts
  FROM public.attachments x WHERE x.transaction_id = p_id;

  DELETE FROM public.transactions WHERE id = p_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'transaction_not_found: lançamento inexistente ou sem permissão' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('row', to_jsonb(t), 'allocations', v_allocs, 'attachments', v_atts);
END;
$$;

REVOKE ALL ON FUNCTION public.create_transactions_with_allocations(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_transaction_with_allocations(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_transaction_with_children(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transactions_with_allocations(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transaction_with_allocations(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_transaction_with_children(uuid) TO authenticated;
