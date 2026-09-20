-- Garante que duas contas não compartilhem o mesmo par banco+conta do OFX.
-- Sem isso, um extrato pode ser importado na conta errada e bagunçar saldo e DRE.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_ofx_identity_uk
  ON public.accounts (ofx_bankid, ofx_acctid)
  WHERE ofx_acctid IS NOT NULL;