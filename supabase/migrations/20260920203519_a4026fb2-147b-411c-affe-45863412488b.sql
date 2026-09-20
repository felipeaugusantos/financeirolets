CREATE UNIQUE INDEX IF NOT EXISTS accounts_ofx_identity_uk
  ON public.accounts (ofx_bankid, ofx_acctid)
  WHERE ofx_acctid IS NOT NULL;

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

DROP TRIGGER IF EXISTS update_card_statement_entries_updated_at ON public.card_statement_entries;
CREATE TRIGGER update_card_statement_entries_updated_at
  BEFORE UPDATE ON public.card_statement_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.kaikin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kaikin_messages_user_created_idx
  ON public.kaikin_messages (user_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kaikin_messages TO authenticated;
GRANT ALL ON public.kaikin_messages TO service_role;
ALTER TABLE public.kaikin_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kaikin_messages_select_own ON public.kaikin_messages;
CREATE POLICY kaikin_messages_select_own ON public.kaikin_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS kaikin_messages_insert_own ON public.kaikin_messages;
CREATE POLICY kaikin_messages_insert_own ON public.kaikin_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS kaikin_messages_update_own ON public.kaikin_messages;
CREATE POLICY kaikin_messages_update_own ON public.kaikin_messages
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS kaikin_messages_delete_own ON public.kaikin_messages;
CREATE POLICY kaikin_messages_delete_own ON public.kaikin_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated can insert statement entries" ON public.bank_statement_entries;
DROP POLICY IF EXISTS "Authenticated can update statement entries" ON public.bank_statement_entries;
DROP POLICY IF EXISTS "Admins can delete statement entries" ON public.bank_statement_entries;
CREATE POLICY "Fin can insert statement entries" ON public.bank_statement_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can update statement entries" ON public.bank_statement_entries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can delete statement entries" ON public.bank_statement_entries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "Authenticated can write card entries" ON public.card_statement_entries;
DROP POLICY IF EXISTS "Authenticated write card entries" ON public.card_statement_entries;
CREATE POLICY "Fin can insert card entries" ON public.card_statement_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can update card entries" ON public.card_statement_entries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can delete card entries" ON public.card_statement_entries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "Authenticated can manage ofx rules" ON public.ofx_import_rules;
CREATE POLICY "Fin can insert ofx rules" ON public.ofx_import_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can update ofx rules" ON public.ofx_import_rules
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "Fin can delete ofx rules" ON public.ofx_import_rules
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));