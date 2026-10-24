-- iFood: lançamentos semanais de repasse (ifood_payout_postings). Idempotente. Migração drizzle 0006.
-- Exige a tabela ifood_stores (SQL 13) e transactions.
CREATE TABLE IF NOT EXISTS public.ifood_payout_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.ifood_stores(id),
  week_start date NOT NULL,
  receivable_id uuid NOT NULL REFERENCES public.transactions(id),
  expense_ids uuid[] NOT NULL DEFAULT '{}',
  gross numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, week_start)
);
REVOKE ALL ON public.ifood_payout_postings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ifood_payout_postings TO authenticated;
GRANT ALL ON public.ifood_payout_postings TO service_role;
ALTER TABLE public.ifood_payout_postings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ifood_payout_postings_access ON public.ifood_payout_postings;
CREATE POLICY ifood_payout_postings_access ON public.ifood_payout_postings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
NOTIFY pgrst, 'reload schema';
