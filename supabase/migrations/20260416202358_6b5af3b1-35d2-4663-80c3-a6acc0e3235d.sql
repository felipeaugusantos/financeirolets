
-- 1. TRANSACTIONS: remover INSERT/UPDATE permissivos por created_by
DROP POLICY IF EXISTS "Auth users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Auth users can update own transactions" ON public.transactions;
-- Permanece apenas a policy "Admin/financeiro can manage transactions" (ALL)

-- 2. STORAGE: limpar todas as policies do bucket attachments e recriar restritas
DROP POLICY IF EXISTS "Authenticated can read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Admin or owner can delete attachments" ON storage.objects;

-- SELECT: admin/financeiro OU dono (pasta = user id)
CREATE POLICY "Owner or admin can read attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'financeiro'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- INSERT: somente na própria pasta do usuário
CREATE POLICY "User can upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- DELETE: admin OU dono
CREATE POLICY "Admin or owner can delete attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );
