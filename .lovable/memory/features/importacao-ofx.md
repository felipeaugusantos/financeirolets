---
name: Importação OFX de extratos
description: Leitura de extratos OFX (Bradesco e Stone), tabela bank_statement_entries com FITID único, conciliação linha a linha e regras por memo.
type: feature
---
- Bancos alvo: **Bradesco** e **Stone**. Parser em `src/lib/ofx.ts` (SGML tolerante, lê `ACCTID`, `BANKID`, `DTPOSTED`, `TRNAMT`, `FITID`, `MEMO/NAME`, `LEDGERBAL`).
- Datas do OFX usam só os 8 primeiros dígitos de `DTPOSTED` — nunca converter via `Date` (deslocaria um dia em UTC-3).
- Anti-duplicidade: `UNIQUE(account_id, fitid)` em `public.bank_statement_entries`. Reimportar o mesmo arquivo nunca duplica.
- **Regra de ouro: o extrato nunca cria lançamento sozinho.** Cada linha é *vinculada*, *criada* ou *ignorada* pelo usuário (mesmo padrão do painel de PIX).
- Match em `src/lib/ofxMatch.ts`: mesma conta, sinal compatível, janela de 5 dias, compara bruto e líquido. Confiança alta/média/baixa.
- Regras por texto do memo em `public.ofx_import_rules` (contains ou regex, prioridade crescente) — só *sugerem* categoria/unidade/frente/parceiro.
- `accounts.ofx_acctid` / `ofx_bankid` identificam a conta no arquivo; gravados na 1ª importação e usados para alertar arquivo de conta errada.
- Tela: Configurações → "Importar extrato (OFX)" (`src/pages/settings/OfxImportSettings.tsx`), hook `useOfxImport.ts`. Testes em `src/test/ofx.test.ts`.
