ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS affects_dre boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS affects_cashflow boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS card_sale_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_transactions_affects_cashflow_false
  ON public.transactions (affects_cashflow) WHERE affects_cashflow = false;

CREATE INDEX IF NOT EXISTS idx_transactions_affects_dre_false
  ON public.transactions (affects_dre) WHERE affects_dre = false;

CREATE INDEX IF NOT EXISTS idx_transactions_card_sale_group
  ON public.transactions (card_sale_group_id) WHERE card_sale_group_id IS NOT NULL;