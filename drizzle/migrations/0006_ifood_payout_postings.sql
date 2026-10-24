CREATE TABLE public.ifood_payout_postings (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ifood_payout_postings TO authenticated;
GRANT ALL ON public.ifood_payout_postings TO service_role;
ALTER TABLE public.ifood_payout_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ifood_payout_postings_access ON public.ifood_payout_postings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));