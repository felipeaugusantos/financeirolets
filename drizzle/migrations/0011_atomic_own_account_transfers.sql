ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS internal_transfer_group_id uuid;
CREATE INDEX IF NOT EXISTS transactions_internal_transfer_group_idx ON public.transactions(internal_transfer_group_id) WHERE internal_transfer_group_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.register_internal_transfer(p_out_entry uuid, p_in_entry uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.bank_statement_entries%ROWTYPE; i public.bank_statement_entries%ROWTYPE; ao public.accounts%ROWTYPE; ai public.accounts%ROWTYPE; g uuid := gen_random_uuid(); ot uuid; it uuid; label text;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN RAISE EXCEPTION 'Somente Administrador ou Financeiro pode confirmar transferências.' USING ERRCODE='42501'; END IF;
 IF p_out_entry = p_in_entry THEN RAISE EXCEPTION 'Selecione duas linhas diferentes.'; END IF;
 PERFORM id FROM public.bank_statement_entries WHERE id IN (p_out_entry,p_in_entry) ORDER BY id FOR UPDATE;
 SELECT * INTO o FROM public.bank_statement_entries WHERE id=p_out_entry;
 SELECT * INTO i FROM public.bank_statement_entries WHERE id=p_in_entry;
 IF o.id IS NULL OR i.id IS NULL THEN RAISE EXCEPTION 'Linha inexistente ou sem permissão.'; END IF;
 IF o.status <> 'pendente' OR i.status <> 'pendente' OR o.transaction_id IS NOT NULL OR i.transaction_id IS NOT NULL THEN RAISE EXCEPTION 'Uma das linhas já foi conciliada. Atualize o extrato.'; END IF;
 IF o.account_id=i.account_id OR o.amount>=0 OR i.amount<=0 OR round(abs(o.amount),2)<>round(i.amount,2) OR abs(o.posted_at-i.posted_at)>2 THEN RAISE EXCEPTION 'Transferência exige saída e entrada de mesmo valor, em contas diferentes, com até dois dias de diferença.'; END IF;
 SELECT * INTO ao FROM public.accounts WHERE id=o.account_id AND active FOR SHARE;
 SELECT * INTO ai FROM public.accounts WHERE id=i.account_id AND active FOR SHARE;
 IF ao.id IS NULL OR ai.id IS NULL THEN RAISE EXCEPTION 'As duas contas devem estar ativas.'; END IF;
 IF ao.default_unit_id IS NULL OR ai.default_unit_id IS NULL THEN RAISE EXCEPTION 'Defina a unidade padrão das duas contas no cadastro de Contas antes de confirmar.'; END IF;
 label := 'Transferência ' || ao.name || ' → ' || ai.name;
 INSERT INTO public.transactions(type,description,amount,net_amount,tax_amount,competence_date,due_date,payment_date,status,payment_method,account_id,unit_id,affects_dre,affects_cashflow,created_by,notes,internal_transfer_group_id)
 VALUES ('despesa',label,abs(o.amount),abs(o.amount),0,o.posted_at,o.posted_at,o.posted_at,'pago','transferencia',o.account_id,ao.default_unit_id,false,true,auth.uid(),'Transferência entre contas próprias; fora do DRE.',g) RETURNING id INTO ot;
 INSERT INTO public.transactions(type,description,amount,net_amount,tax_amount,competence_date,due_date,payment_date,status,payment_method,account_id,unit_id,affects_dre,affects_cashflow,created_by,notes,internal_transfer_group_id)
 VALUES ('receita',label,i.amount,i.amount,0,i.posted_at,i.posted_at,i.posted_at,'recebido','transferencia',i.account_id,ai.default_unit_id,false,true,auth.uid(),'Transferência entre contas próprias; fora do DRE.',g) RETURNING id INTO it;
 UPDATE public.bank_statement_entries SET transaction_id=CASE WHEN id=o.id THEN ot ELSE it END,status='vinculado',match_note='Transferência interna entre contas próprias (fora do DRE)',decided_by=auth.uid(),decided_at=now() WHERE id IN (o.id,i.id);
 RETURN g;
END; $$;
REVOKE ALL ON FUNCTION public.register_internal_transfer(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_internal_transfer(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.undo_internal_transfer(p_entry_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE g uuid; ids uuid[];
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN RAISE EXCEPTION 'Somente Administrador ou Financeiro pode desfazer transferências.' USING ERRCODE='42501'; END IF;
 SELECT t.internal_transfer_group_id INTO g FROM public.bank_statement_entries e JOIN public.transactions t ON t.id=e.transaction_id WHERE e.id=p_entry_id;
 IF g IS NULL THEN RETURN false; END IF;
 PERFORM id FROM public.transactions WHERE internal_transfer_group_id=g ORDER BY id FOR UPDATE;
 SELECT array_agg(id) INTO ids FROM public.transactions WHERE internal_transfer_group_id=g;
 IF cardinality(ids)<>2 THEN RAISE EXCEPTION 'Transferência incompleta; revise os vínculos antes de continuar.'; END IF;
 PERFORM id FROM public.bank_statement_entries WHERE transaction_id=ANY(ids) ORDER BY id FOR UPDATE;
 UPDATE public.transactions SET status='cancelado',notes=coalesce(notes,'') || E'\nTransferência desfeita pela conciliação.' WHERE id=ANY(ids);
 UPDATE public.bank_statement_entries SET transaction_id=NULL,status='pendente',match_note=NULL,ignore_reason=NULL,decided_by=auth.uid(),decided_at=now() WHERE transaction_id=ANY(ids);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.undo_internal_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_internal_transfer(uuid) TO authenticated;
COMMENT ON COLUMN public.transactions.internal_transfer_group_id IS 'Pairs the two own-account cash legs, excluded from DRE; reconciliation cancellation affects both legs atomically.';