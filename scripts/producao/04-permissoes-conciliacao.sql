-- ---------------------------------------------------------------
-- Segurança: escrita de conciliação restrita a Admin e Financeiro.
-- Leitura continua liberada para qualquer usuário autenticado.
-- Idempotente.
-- ---------------------------------------------------------------

-- Extrato bancário (OFX)
DROP POLICY IF EXISTS "Authenticated can insert statement entries" ON public.bank_statement_entries;
DROP POLICY IF EXISTS "Authenticated can update statement entries" ON public.bank_statement_entries;
DROP POLICY IF EXISTS "Admins can delete statement entries" ON public.bank_statement_entries;

CREATE POLICY "Fin can insert statement entries" ON public.bank_statement_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can update statement entries" ON public.bank_statement_entries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can delete statement entries" ON public.bank_statement_entries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

-- Extrato de cartão
DROP POLICY IF EXISTS "Authenticated can write card entries" ON public.card_statement_entries;
DROP POLICY IF EXISTS "Authenticated write card entries" ON public.card_statement_entries;

CREATE POLICY "Fin can insert card entries" ON public.card_statement_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can update card entries" ON public.card_statement_entries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can delete card entries" ON public.card_statement_entries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

-- Regras de importação
DROP POLICY IF EXISTS "Authenticated can manage ofx rules" ON public.ofx_import_rules;

CREATE POLICY "Fin can insert ofx rules" ON public.ofx_import_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can update ofx rules" ON public.ofx_import_rules
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can delete ofx rules" ON public.ofx_import_rules
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
