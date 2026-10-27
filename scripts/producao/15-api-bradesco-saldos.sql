-- API de Saldo e Extrato do Bradesco: registro dos saldos consultados e do histórico das consultas.
-- Só estrutura de apoio; as credenciais NÃO ficam no banco. Acesso restrito a Admin/Financeiro. Idempotente.

CREATE TABLE IF NOT EXISTS public.bank_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ref_date date NOT NULL,
  source text NOT NULL CHECK (source IN ('api_saldo','api_extrato','ofx','manual')),
  total_resources numeric(14,2),
  checking_balance numeric(14,2),
  total_balance numeric(14,2),
  blocked numeric(14,2),
  overdraft_limit numeric(14,2),
  invest_auto numeric(14,2),
  invest_redeem numeric(14,2),
  invest_grace numeric(14,2),
  ledger_balance numeric(14,2),
  raw jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ref_date, source)
);
CREATE INDEX IF NOT EXISTS bank_balance_snapshots_account_date_idx ON public.bank_balance_snapshots (account_id, ref_date DESC);

CREATE TABLE IF NOT EXISTS public.bank_api_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('saldo','extrato')),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','automatico')),
  period_from date,
  period_to date,
  http_status integer,
  return_code text,
  rows_received integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  error text,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_api_sync_runs_account_idx ON public.bank_api_sync_runs (account_id, created_at DESC);

ALTER TABLE public.bank_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_api_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_balance_snapshots, public.bank_api_sync_runs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_balance_snapshots, public.bank_api_sync_runs TO authenticated;
GRANT ALL ON public.bank_balance_snapshots, public.bank_api_sync_runs TO service_role;

DROP POLICY IF EXISTS bank_balance_snapshots_fin ON public.bank_balance_snapshots;
CREATE POLICY bank_balance_snapshots_fin ON public.bank_balance_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
DROP POLICY IF EXISTS bank_api_sync_runs_fin ON public.bank_api_sync_runs;
CREATE POLICY bank_api_sync_runs_fin ON public.bank_api_sync_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

NOTIFY pgrst, 'reload schema';
