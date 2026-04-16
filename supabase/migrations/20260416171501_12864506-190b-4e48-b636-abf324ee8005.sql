
-- 1. Restringir leitura de partners (dados sensíveis PII)
DROP POLICY IF EXISTS "Auth users can read partners" ON public.partners;
CREATE POLICY "Admin/financeiro can read partners"
  ON public.partners FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

-- 2. Restringir leitura de transações
DROP POLICY IF EXISTS "Auth users can read transactions" ON public.transactions;
CREATE POLICY "Users can read own or admin transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'financeiro'::app_role)
    OR has_role(auth.uid(), 'gerente_unidade'::app_role)
  );

-- 3. Restringir leitura de alocações
DROP POLICY IF EXISTS "Auth users can read allocations" ON public.transaction_allocations;
CREATE POLICY "Admin/financeiro/gerente can read allocations"
  ON public.transaction_allocations FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'financeiro'::app_role)
    OR has_role(auth.uid(), 'gerente_unidade'::app_role)
  );

-- 4. Tornar bucket attachments privado
UPDATE storage.buckets SET public = false WHERE id = 'attachments';

-- 5. Recriar políticas de storage para o bucket privado
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete attachments" ON storage.objects;

-- Leitura: apenas autenticados
CREATE POLICY "Authenticated can read attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments');

-- Upload: autenticados, pasta do próprio user
CREATE POLICY "Authenticated can upload attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments');

-- Delete: apenas admin ou quem fez upload (pasta do user)
CREATE POLICY "Admin or owner can delete attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );
