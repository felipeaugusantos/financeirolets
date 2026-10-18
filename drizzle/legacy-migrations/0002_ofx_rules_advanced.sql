ALTER TABLE public.ofx_import_rules
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS exclude_pattern text,
  ADD COLUMN IF NOT EXISTS min_amount numeric,
  ADD COLUMN IF NOT EXISTS max_amount numeric,
  ADD COLUMN IF NOT EXISTS use_statement_unit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allocations jsonb;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS default_unit_id uuid REFERENCES public.units(id);

CREATE INDEX IF NOT EXISTS ofx_import_rules_account_idx ON public.ofx_import_rules (account_id);