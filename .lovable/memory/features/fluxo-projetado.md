---
name: Fluxo de Caixa Projetado
description: Relatório de Fluxo de Caixa com tabs Realizado/Projetado/Comparativo, somando pagos por payment_date e pendentes/agendados por due_date.
type: feature
---
- Hook `useCashFlowProjected` busca duas queries em paralelo: realizadas (status pago/recebido por payment_date) e projetadas (status pendente/agendado por due_date). Suporta filtro por unidade com rateio.
- Componente `CashFlowReport.tsx` agora tem `Tabs` Realizado/Projetado/Comparativo. Realizado mantém comportamento anterior. Projetado usa stacked bars (realiz. + projet.) por receita/despesa. Comparativo plota saldo realizado vs projetado lado a lado.
- Exportação CSV adapta colunas conforme o modo selecionado.
