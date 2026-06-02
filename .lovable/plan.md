## Objetivo

Permitir que o usuário escolha o período visualizado no Dashboard, em vez de tudo ficar travado em "mês atual" + "últimos 6 meses". Manter o comportamento atual como default (mês vigente).

## UX

Adicionar um seletor de período no header do Dashboard, ao lado dos filtros existentes (Unidade, Frente, Incluir provisionados):

- **Presets rápidos** (Select):
  - Mês atual (default)
  - Mês anterior
  - Últimos 3 meses
  - Últimos 6 meses
  - Ano atual (YTD)
  - Ano anterior
  - Personalizado…
- Quando "Personalizado" for escolhido, mostrar dois date pickers (De / Até) usando o padrão Shadcn já usado em `TransactionFilters`.

O período selecionado afeta:
- KPIs "Receitas do Mês", "Despesas do Mês", "Margem" → passam a refletir o período (renomear sutilmente para "Receitas do Período" etc. quando não for mês atual).
- Gráficos "Receitas vs Despesas" (barras mensais dentro do range) e os dois pies de categorias (mês atual → período).
- Ranking de despesas por unidade (mês atual → período).
- Variação vs período anterior: comparar com período de mesma duração imediatamente anterior.
- "Saldo Total" e os cards de "Contas em atraso / vencendo hoje" continuam independentes do período (são snapshots de hoje).

## Mudanças técnicas

1. **`src/hooks/useDashboard.ts`**
   - Estender `DashboardFilters` com `period: { from: string; to: string }` (YYYY-MM-DD).
   - Substituir as constantes `currentMonth` / `sixMonthsAgo` pelo range vindo do filtro.
   - Buscar transações no range; agregar:
     - KPIs do período (receitas/despesas pagas + provisionadas dentro do range, usando `competence_date` para provisionados e `payment_date` para pagos, igual lógica atual).
     - Série mensal: gerar buckets do primeiro ao último mês do range (até um teto razoável, ex. 24 meses; acima disso, agregar em meses sem renderizar todos).
     - Categorias (despesas/receitas) consideram todo o range.
     - Ranking por unidade idem.
   - Cálculo de variação: comparar com janela anterior de mesma duração.
   - Manter `saldoTotal` e alertas de vencimento como hoje (sem filtro de período).

2. **`src/pages/Dashboard.tsx`**
   - Novo state `periodPreset` + `customRange { from, to }`.
   - Helper `resolvePeriod(preset, custom)` → `{ from, to, label }`.
   - Passar `period` para `useDashboard`.
   - Header: novo `<Select>` de preset + (quando custom) dois date pickers em popover.
   - Ajustar títulos dos cards/gráficos: "Receitas do Período", "Despesas por Categoria ({label})", etc.
   - Manter default = "Mês atual" para preservar a experiência atual.

3. Sem mudanças de schema, sem novas dependências.

## Fora do escopo

- Filtros de período em Relatórios / Contas (já existem lá).
- Persistir o período escolhido entre sessões.
