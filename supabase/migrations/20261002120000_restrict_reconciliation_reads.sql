-- Endurece RLS: dados de conciliação deixam de ser legíveis por qualquer usuário
-- autenticado (ex.: vendedor/operador) e passam a Admin/Financeiro.
-- Revisões de conferência: escrita só por Admin/Financeiro.
-- Idempotente. REVISAR antes de aplicar: se Gerente/Operador usar essas telas, ajustar.

DROP POLICY IF EXISTS "Authenticated can read statement entries" ON public.bank_statement_entries;
CREATE POLICY "Fin can read statement entries" ON public.bank_statement_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "Authenticated read card entries" ON public.card_statement_entries;
DROP POLICY IF EXISTS "Authenticated can read card entries" ON public.card_statement_entries;
CREATE POLICY "Fin can read card entries" ON public.card_statement_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "Authenticated can read ofx rules" ON public.ofx_import_rules;
CREATE POLICY "Fin can read ofx rules" ON public.ofx_import_rules
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "Authenticated can create reviews" ON public.transaction_reviews;
DROP POLICY IF EXISTS "Authenticated can update reviews" ON public.transaction_reviews;
CREATE POLICY "Fin can create reviews" ON public.transaction_reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewed_by = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')));
CREATE POLICY "Fin can update reviews" ON public.transaction_reviews
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (reviewed_by = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')));
