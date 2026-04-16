
-- Restringir leitura da tabela attachments
DROP POLICY IF EXISTS "Auth users can read attachments" ON public.attachments;
CREATE POLICY "Owner or admin can read attachment records"
  ON public.attachments FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'financeiro'::app_role)
    OR uploaded_by = auth.uid()
  );

-- Adicionar UPDATE policy no storage para attachments
CREATE POLICY "Admin or owner can update attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );
