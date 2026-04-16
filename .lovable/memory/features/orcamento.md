---
name: Orçamento (Budgets)
description: Tabela budgets para planejamento anual por linha do DRE/unidade, com tela em Configurações e integração no DRE como Orçado vs Realizado.
type: feature
---
- Tabela `budgets (year, month, dre_line_id, unit_id, planned_amount)` com unique por combinação. `unit_id` NULL = consolidado.
- Tela `/configuracoes/orcamento` (BudgetSettings.tsx): grid linhas DRE × 12 meses, edição inline com onBlur, totalizador anual. Botão "Copiar de ano anterior" com ajuste percentual via upsert.
- Hook `useBudgets(year, unitId)` faz CRUD com upsert/delete (delete quando valor=0).
- DRE (`useDreReport`) ganha `includeBudget` e `includePrevious`. Quando ativo, busca budgets do período (somando meses dentro do range) e roda mesma `buildSubtotals` para herdar sinal e roll-up.
- DreReport.tsx: switches "Orçado vs Realizado", "Análise Horizontal" e "Análise Vertical (% receita)". Variação % colorida pelo "good direction" (positiva boa para receita, ruim para despesa via sign).
- Apenas Admin/Financeiro podem gerenciar; Gerente unidade pode ler.
