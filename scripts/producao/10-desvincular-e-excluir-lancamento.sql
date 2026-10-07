-- Desvincular linha(s) do extrato E excluir o lançamento que foi criado a partir delas, de forma ATÔMICA.
--
-- Regra de negócio (pedida pelo cliente): ao excluir uma conciliação, o lançamento que nasceu da
-- própria linha do extrato ("Criado a partir do extrato...") também é excluído.
--
-- Salvaguardas:
--  * Lançamento que JÁ EXISTIA e foi apenas vinculado (match_note diferente) NUNCA é excluído.
--  * Lançamento agrupado (várias linhas -> 1 lançamento) só é excluído quando nenhuma outra linha
--    do extrato ou do cartão continua ligada a ele.
--  * Mês fechado: o trigger block_closed_period recusa a exclusão e TUDO é desfeito (as linhas
--    continuam vinculadas).
--  * Linhas 'ignorado' podem ser reabertas pela mesma função (não têm lançamento).
--
-- SECURITY INVOKER: o RLS vale (só Admin/Financeiro alteram linhas e excluem lançamentos).
-- A exclusão do lançamento é registrada pelo trigger de auditoria de transactions.
-- Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.unlink_statement_entries(p_entry_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_expected int := coalesce(array_length(p_entry_ids, 1), 0);
  v_locked int;
  v_candidates uuid[];
  v_tx uuid;
  v_deleted int := 0;
  v_kept int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;
  IF v_expected = 0 THEN
    RAISE EXCEPTION 'invalid_entries: informe ao menos uma linha' USING ERRCODE = 'P0001';
  END IF;

  -- Trava as linhas (que precisam existir e estar visíveis/permitidas) e separa os lançamentos
  -- criados a partir delas ANTES de limpar o vínculo.
  SELECT count(*),
         coalesce(array_agg(DISTINCT transaction_id) FILTER (
           WHERE transaction_id IS NOT NULL AND match_note LIKE 'Criado a partir do extrato%'), '{}')
    INTO v_locked, v_candidates
  FROM (
    SELECT id, transaction_id, match_note
    FROM public.bank_statement_entries
    WHERE id = ANY (p_entry_ids)
    FOR UPDATE
  ) locked;

  IF v_locked <> (SELECT count(DISTINCT x) FROM unnest(p_entry_ids) x) THEN
    RAISE EXCEPTION 'entry_not_found: linha inexistente ou sem permissão' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_entries
  SET transaction_id = NULL, status = 'pendente', match_note = NULL, ignore_reason = NULL,
      decided_by = auth.uid(), decided_at = now()
  WHERE id = ANY (p_entry_ids);

  FOREACH v_tx IN ARRAY v_candidates LOOP
    IF EXISTS (SELECT 1 FROM public.bank_statement_entries WHERE transaction_id = v_tx)
       OR EXISTS (SELECT 1 FROM public.card_statement_entries WHERE transaction_id = v_tx) THEN
      v_kept := v_kept + 1;               -- ainda há outra linha ligada a este lançamento
    ELSE
      DELETE FROM public.transactions WHERE id = v_tx;
      IF FOUND THEN v_deleted := v_deleted + 1; ELSE v_kept := v_kept + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('unlinked', v_locked, 'deleted', v_deleted, 'kept', v_kept);
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_statement_entries(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_statement_entries(uuid[]) TO authenticated;
