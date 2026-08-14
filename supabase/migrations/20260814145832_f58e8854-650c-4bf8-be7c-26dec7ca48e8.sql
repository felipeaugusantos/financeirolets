CREATE TYPE public.review_status AS ENUM ('pending','reviewed','corrected','ignored');

CREATE TABLE public.transaction_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  status public.review_status NOT NULL DEFAULT 'pending',
  note text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.transaction_reviews TO authenticated;
GRANT ALL ON public.transaction_reviews TO service_role;

ALTER TABLE public.transaction_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view reviews"
  ON public.transaction_reviews FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create reviews"
  ON public.transaction_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND reviewed_by = auth.uid());

CREATE POLICY "Authenticated can update reviews"
  ON public.transaction_reviews FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (reviewed_by = auth.uid());

CREATE INDEX idx_transaction_reviews_status ON public.transaction_reviews(status);

CREATE TRIGGER update_transaction_reviews_updated_at
  BEFORE UPDATE ON public.transaction_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();