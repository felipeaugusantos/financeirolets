CREATE INDEX IF NOT EXISTS idx_transactions_payment_date ON public.transactions(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_competence_date ON public.transactions(competence_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account_payment ON public.transactions(account_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_unit_payment ON public.transactions(unit_id, payment_date DESC);