-- Criar lançamento a partir de uma linha da planilha de cartão e marcá-la como conciliada,
-- de forma ATÔMICA (mesmo problema e solução de create_transaction_from_entries, no extrato).
--
-- Antes: o app inseria o lançamento e depois atualizava a linha (status 'conciliado'), em duas
-- chamadas. O resultado do UPDATE nem era verificado: se ele falhasse, a linha seguia 'pendente'
-- com o lançamento já criado, e a próxima tentativa gerava um lançamento duplicado.
--
-- Agora o lançamento é montado no banco a partir da própria linha (travada com FOR UPDATE, que
-- precisa estar pendente e sem lançamento), e a ligação acontece na mesma transação.
--
-- SECURITY INVOKER: o RLS continua valendo (só Admin/Financeiro escrevem na conciliação).
-- Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.create_transaction_from_card_entry(p_entry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  e public.card_statement_entries%ROWTYPE;
  v_tx_id uuid;
  v_amount numeric;
  v_type transaction_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO e FROM public.card_statement_entries
  WHERE id = p_entry_id AND status = 'pendente' AND transaction_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry_not_pending: linha do cartão inexistente, já conciliada ou sem permissão'
      USING ERRCODE = 'P0001';
  END IF;

  IF e.unit_id IS NULL OR e.category_id IS NULL THEN
    RAISE EXCEPTION 'missing_fields: informe unidade e categoria da linha' USING ERRCODE = 'P0001';
  END IF;

  v_amount := abs(e.amount);
  v_type := CASE WHEN e.amount >= 0 THEN 'receita' ELSE 'despesa' END::transaction_type;

  INSERT INTO public.transactions (
    type, description, amount, tax_amount, net_amount,
    competence_date, due_date, payment_date, status,
    account_id, category_id, unit_id, front_id,
    payment_method, notes, created_by
  ) VALUES (
    v_type, e.description, v_amount, 0, v_amount,
    e.posted_at, e.posted_at, e.posted_at,
    (CASE WHEN v_type = 'receita' THEN 'recebido' ELSE 'pago' END)::transaction_status,
    e.account_id, e.category_id, e.unit_id, e.front_id,
    coalesce(e.payment_method, 'cartao_credito'),
    'Importado da planilha de cartão (' || coalesce(e.source_file, 'arquivo') || ')'
      || CASE WHEN coalesce(e.card_last4, '') <> '' THEN ' — final ' || e.card_last4 ELSE '' END,
    auth.uid()
  ) RETURNING id INTO v_tx_id;

  UPDATE public.card_statement_entries
  SET transaction_id = v_tx_id,
      status = 'conciliado',
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = e.id;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_transaction_from_card_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transaction_from_card_entry(uuid) TO authenticated;
