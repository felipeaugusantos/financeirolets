-- Versão idempotente da criação da tabela de extrato de cartão.
CREATE TABLE IF NOT EXISTS public.card_statement_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  card_last4 text,
  posted_at date NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  row_hash text NOT NULL,
  source_file text,
  status text NOT NULL DEFAULT 'pendente',
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  front_id uuid REFERENCES public.business_fronts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  payment_method public.payment_method,
  note text,
  imported_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_statement_entries_unique_row ON public.card_statement_entries (row_hash);
CREATE INDEX IF NOT EXISTS card_statement_entries_posted_at_idx ON public.card_statement_entries (posted_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_statement_entries TO authenticated;
GRANT ALL ON public.card_statement_entries TO service_role;

ALTER TABLE public.card_statement_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read card entries" ON public.card_statement_entries;
CREATE POLICY "Authenticated read card entries" ON public.card_statement_entries
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated write card entries" ON public.card_statement_entries;
CREATE POLICY "Authenticated write card entries" ON public.card_statement_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_card_statement_entries_updated_at ON public.card_statement_entries;
CREATE TRIGGER update_card_statement_entries_updated_at
  BEFORE UPDATE ON public.card_statement_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();