ALTER TABLE public.bank_statement_entries
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS decided_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ignore_reason text;