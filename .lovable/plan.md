# Fechamento de julho: origem dos PIX e saldos bancários

Duas frentes: (1) classificar caso a caso os PIX de Martinho & Souza, já que há tipos misturados; (2) gravar os saldos das contas em 30/06 com data-base.

## 1. Triagem dos PIX Martinho & Souza

Hoje existem 54 lançamentos ligados a Martinho & Souza (mai a jul/2026), sendo 20 em julho (R$ 128.192,18 entre Café e Franqueadora). Como o mesmo remetente carrega naturezas diferentes, nada será alterado em massa.

Nova aba "PIX a classificar" dentro da tela de Conferência de lançamentos, listando esses PIX com valor, data, conta e histórico, e um seletor de natureza por lançamento:

- Recebimento de loja (venda) — receita normal, permanece no DRE
- Transferência entre contas do grupo (ex.: caiu no Boulevard, remanejado para Franqueadora) — sai do DRE, continua no Fluxo de Caixa
- Repasse Stone Boulevard — recebível de cartão; entra como liquidação de venda, não como nova receita
- Recebível iFood — identificado pela diferença de valor; vinculado à receita bruta já lançada
- PIX do app do Café acumulado em conta Caixa — transferência quando consolidado

Cada escolha aplica o conjunto correto de flags (`affects_dre`, `affects_cashflow`, categoria/linha DRE) e só é gravada após o diálogo "Antes vs Depois" já existente, com registro em audit_logs.

Apoios para acelerar a triagem:
- Sugestão automática de natureza por padrão de valor/histórico (Stone, iFood, valores redondos de remanejo), sempre editável.
- Detecção de pares de transferência: quando saída e entrada de mesmo valor aparecem em contas diferentes em até 3 dias, propõe marcar as duas como transferência.
- Totalizador ao vivo do impacto no DRE de julho conforme as classificações vão sendo feitas.

## 2. Saldos bancários com data-base

- Adicionar campo de data-base do saldo inicial nas contas.
- Gravar: Fábrica R$ 23.983,72 · Boulevard R$ 0,00 · Café R$ 63.919,61 · Franqueadora R$ 1.362,41, todos com data-base 30/06/2026.
- Tela de Contas passa a editar valor + data-base juntos, com aviso de que alterar a data-base muda o saldo exibido em todos os relatórios.
- Fluxo de Caixa e os cards de saldo do Dashboard passam a partir do saldo inicial e somar apenas movimentos posteriores à data-base (nunca somam o saldo em períodos anteriores a ela).
- Contas sem saldo informado continuam em zero, sem impacto.

## Detalhes técnicos

- Migração: coluna `initial_balance_date date` em `public.accounts`; sem alteração em lançamentos históricos.
- Atualização de dados dos 4 saldos via operação de dados separada, auditada.
- `src/lib/finance.ts`: função de saldo acumulado que respeita a data-base; consumida por `useDashboard.ts` e `useCashFlowReport.ts`.
- Classificação de PIX reaproveita `useReviewActions.ts`, `ConfirmChangeDialog.tsx` e `transaction_reviews` para status de revisão.
- Regras de natureza centralizadas em `src/lib/categoryRules.ts`.
- Novos testes em `src/test/invariants.test.ts`: saldo antes/depois da data-base e neutralidade de transferências no DRE.

## Validação ao final

- Fluxo de Caixa de julho segue batendo R$ 0,00 contra os quatro extratos.
- Saldo final do sistema em 31/07 igual ao dos extratos, agora com saldo inicial.
- DRE de julho recomposto apenas pelos PIX classificados como não-receita, com relatório do antes/depois.
