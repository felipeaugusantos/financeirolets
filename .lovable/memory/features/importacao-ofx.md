---
name: Importação OFX de extratos
description: Leitura de extratos OFX (Bradesco e Stone), tabela bank_statement_entries com FITID único, conciliação linha a linha, ações em lote e regras por memo.
type: feature
---
- Menu próprio **Conciliação Bancária** com dois submenus: `/conciliacao/bancos` (cadastro de banco) e `/conciliacao/conciliar` (conciliação OFX).
- Bancos alvo: **Bradesco** e **Stone**. Parser em `src/lib/ofx.ts` (SGML tolerante, lê `ACCTID`, `BANKID`, `DTPOSTED`, `TRNAMT`, `FITID`, `MEMO/NAME`, `LEDGERBAL`).
- Datas do OFX usam só os 8 primeiros dígitos de `DTPOSTED` — nunca converter via `Date` (deslocaria um dia em UTC-3).
- Anti-duplicidade: `UNIQUE(account_id, fitid)` em `public.bank_statement_entries`. Reimportar o mesmo arquivo nunca duplica.
- **Regra de ouro: o extrato nunca cria lançamento sozinho.** Cada linha é *vinculada*, *criada* ou *ignorada* pelo usuário (mesmo padrão do painel de PIX).
- Match em `src/lib/ofxMatch.ts`, janela de 7 dias, pontuação 0-100 → confiança alta/média/baixa. O valor é explicado por uma base (`basis`): exato, líquido (net_amount ou bruto ± tax_amount), **taxa** de adquirente (até 6% e R$ 500 a menos), **juros/multa** (até 12% a mais, pago após o vencimento) ou arredondamento. Texto usa tokens sem palavras genéricas (pix, ted, pgto...) + similaridade de Dice + nome do parceiro.
- Ações em lote: `pickAutoLinkable` só libera vínculo automático com confiança alta, candidato único e sem empate (<8 pontos) nem disputa pelo mesmo lançamento. **Ignorar em lote exige justificativa**, gravada em `ignore_reason` + `decided_by`/`decided_at` de cada linha.
- Regras por texto do memo em `public.ofx_import_rules` (contains ou regex, prioridade crescente) — só *sugerem* categoria/unidade/frente/parceiro.
- `accounts.ofx_acctid` / `ofx_bankid` identificam a conta no arquivo; gravados na 1ª importação e usados para alertar arquivo de conta errada.
- Arquivos: `src/pages/settings/OfxImportSettings.tsx`, `src/hooks/useOfxImport.ts`, `src/components/ofx/OfxRulesPanel.tsx`. Testes em `src/test/ofx.test.ts`.
