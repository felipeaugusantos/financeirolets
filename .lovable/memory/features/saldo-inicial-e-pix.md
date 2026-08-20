---
name: Saldo inicial com data-base e triagem de PIX
description: Regras de saldo inicial das contas (data-base 30/06/2026) e classificação de natureza dos PIX Martinho & Souza.
type: feature
---
## Saldo inicial
- `accounts.initial_balance_date` é a data-base: o saldo vale NESSE dia e só movimentos POSTERIORES são somados (helpers `buildOpeningMap`, `openingBalanceTotal`, `isAfterOpening` em `src/lib/finance.ts`).
- Saldos oficiais em 30/06/2026: Fábrica 23.983,72 · Boulevard 0,00 · Café 63.919,61 · Franqueadora 1.362,41.
- Conta sem data-base mantém o comportamento antigo (entra sempre).
- Fluxo de Caixa parte do saldo inicial no acumulado; com filtro de unidade parte de zero (saldo é por conta, não por unidade).

## Naturezas de PIX (Martinho & Souza)
Origem mistura tipos. Só "Recebimento de loja (venda)" fica no DRE; transferência entre contas, repasse Stone Boulevard, recebível iFood e PIX do app do Café (conta Caixa) saem do DRE e continuam no Fluxo de Caixa. A decisão é gravada como `[natureza: x]` em `notes` e aplicada só após confirmação Antes/Depois.
