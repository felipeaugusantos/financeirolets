-- Criar lançamento a partir de linha(s) do extrato bancário e ligá-las, de forma ATÔMICA.
--
-- Antes: o app inseria o lançamento, depois o rateio e só então atualizava a linha do extrato,
-- em chamadas separadas. Se a ligação falhava, o lançamento ficava órfão e a linha seguia
-- "pendente"; ao tentar de novo, nascia um segundo lançamento (duplicidade de receita/despesa).
--
-- Agora tudo acontece numa única transação: ou cria o lançamento, o rateio e liga as linhas,
-- ou não faz nada. As linhas são travadas (FOR UPDATE) e precisam estar pendentes, então uma
-- nova tentativa sobre linha já tratada falha em vez de duplicar.
--
-- SECURITY INVOKER: as políticas de RLS continuam valendo (quem não pode escrever na
-- conciliação não consegue usar a função). Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.create_transaction_from_entries(
  p_entry_ids uuid[],
  p_tx jsonb,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_expected int := coalesce(array_length(p_entry_ids, 1), 0);
  v_locked int;
  v_updated int;
  v_tx_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;
  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Nenhuma linha de extrato informada' USING ERRCODE = '22023';
  END IF;

  -- Trava as linhas e confere que TODAS ainda estão pendentes e sem lançamento.
  SELECT count(*) INTO v_locked FROM (
    SELECT 1 FROM public.bank_statement_entries
    WHERE id = ANY(p_entry_ids) AND status = 'pendente' AND transaction_id IS NULL
    FOR UPDATE
  ) s;
  IF v_locked <> v_expected THEN
    RAISE EXCEPTION 'entry_not_pending: linha do extrato inexistente, já tratada ou sem permissão'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.transactions (
    type, description, amount, tax_amount, net_amount,
    competence_date, due_date, payment_date, status,
    account_id, category_id, unit_id, front_id, partner_id,
    payment_method, notes, created_by
  ) VALUES (
    (p_tx->>'type')::transaction_type,
    p_tx->>'description',
    (p_tx->>'amount')::numeric,
    coalesce((p_tx->>'tax_amount')::numeric, 0),
    coalesce((p_tx->>'net_amount')::numeric, (p_tx->>'amount')::numeric),
    (p_tx->>'competence_date')::date,
    (p_tx->>'due_date')::date,
    (p_tx->>'payment_date')::date,
    (p_tx->>'status')::transaction_status,
    (p_tx->>'account_id')::uuid,
    (p_tx->>'category_id')::uuid,
    (p_tx->>'unit_id')::uuid,
    (p_tx->>'front_id')::uuid,
    (p_tx->>'partner_id')::uuid,
    (p_tx->>'payment_method')::payment_method,
    p_tx->>'notes',
    auth.uid()
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.transaction_allocations (
    transaction_id, unit_id, front_id, allocation_type, percentage, amount
  )
  SELECT
    v_tx_id,
    (a->>'unit_id')::uuid,
    (a->>'front_id')::uuid,
    (a->>'allocation_type')::allocation_type,
    (a->>'percentage')::numeric,
    (a->>'amount')::numeric
  FROM jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) a;

  UPDATE public.bank_statement_entries
  SET transaction_id = v_tx_id,
      status = 'vinculado',
      match_note = p_note,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = ANY(p_entry_ids) AND status = 'pendente' AND transaction_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'entry_not_pending: não foi possível ligar todas as linhas do extrato'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_transaction_from_entries(uuid[], jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transaction_from_entries(uuid[], jsonb, jsonb, text) TO authenticated;
