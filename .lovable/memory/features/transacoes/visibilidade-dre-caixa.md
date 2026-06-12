---
name: Visibilidade DRE x Caixa + Venda no cartão
description: Flags affects_dre/affects_cashflow no transactions e atalho "Venda no cartão" gerando par bruto (só DRE) + líquido (só caixa) vinculados por card_sale_group_id.
type: feature
---
- Colunas em `transactions`: `affects_dre` (default true), `affects_cashflow` (default true), `card_sale_group_id` (uuid, nullable).
- DRE (`useDreReport`) filtra `affects_dre = true`; Fluxo de Caixa (`useCashFlowReport`, `useCashFlowProjected`) e saldo do Dashboard (`useDashboard`) filtram `affects_cashflow = true`. Dashboard KPIs do período respeitam ambas flags conforme a métrica.
- Form de lançamento (`TransactionFormDialog`): bloco "Onde este lançamento aparece?" com 3 chips (Normal / Taxa-Ajuste / Transferência) + 2 switches independentes + texto-resumo dinâmico (alerta vermelho quando ambos desligados).
- Atalho "Venda no cartão" (`CardSaleDialog`, botão ao lado de Novo em `Transactions.tsx`): captura bruto + taxa (% ou R$) + taxa esperada (alerta se real > esperada), cria 2 linhas vinculadas por `card_sale_group_id`: (1) receita bruta com `affects_dre=true, affects_cashflow=false` e (2) entrada líquida com `affects_dre=false, affects_cashflow=true`.
- Lista de lançamentos mostra badges discretos "só DRE"/"só caixa" com tooltip quando a transação não está em ambos.