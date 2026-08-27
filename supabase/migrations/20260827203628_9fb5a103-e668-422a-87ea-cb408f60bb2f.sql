ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS ofx_acctid text,
  ADD COLUMN IF NOT EXISTS ofx_bankid text;

CREATE TABLE public.bank_statement_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  fitid text NOT NULL,
  posted_at date NOT NULL,
  amount numeric NOT NULL,
  memo text,
  trn_type text,
  check_number text,
  raw jsonb,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendente',
  match_note text,
  source_file text,
  imported_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bank_statement_entries_status_check CHECK (status IN ('pendente','vinculado','ignorado')),
  CONSTRAINT bank_statement_entries_unique_fitid UNIQUE (account_id, fitid)
);

CREATE INDEX bank_statement_entries_account_date_idx ON public.bank_statement_entries(account_id, posted_at);
CREATE INDEX bank_statement_entries_status_idx ON public.bank_statement_entries(status);
CREATE INDEX bank_statement_entries_transaction_idx ON public.bank_statement_entries(transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_entries TO authenticated;
GRANT ALL ON public.bank_statement_entries TO service_role;

ALTER TABLE public.bank_statement_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read statement entries"
  ON public.bank_statement_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert statement entries"
  ON public.bank_statement_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update statement entries"
  ON public.bank_statement_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete statement entries"
  ON public.bank_statement_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_bank_statement_entries_updated_at
  BEFORE UPDATE ON public.bank_statement_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.ofx_import_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains',
  applies_to text NOT NULL DEFAULT 'ambos',
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  front_id uuid REFERENCES public.business_fronts(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ofx_import_rules_match_type_check CHECK (match_type IN ('contains','regex')),
  CONSTRAINT ofx_import_rules_applies_to_check CHECK (applies_to IN ('receita','despesa','ambos'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ofx_import_rules TO authenticated;
GRANT ALL ON public.ofx_import_rules TO service_role;

ALTER TABLE public.ofx_import_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ofx rules"
  ON public.ofx_import_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage ofx rules"
  ON public.ofx_import_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_ofx_import_rules_updated_at
  BEFORE UPDATE ON public.ofx_import_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();