

## Plano: Lançamentos na página de Contas + Filtros no Dashboard

### 1. Botão "Novo Lançamento" na página de Contas a Pagar/Receber

**O que muda:** Cada aba (Pagar / Receber) ganha um botão "+ Novo" que abre o `TransactionFormDialog` já existente, pré-configurando o tipo como `despesa` (aba Pagar) ou `receita` (aba Receber) e status como `pendente`.

**Arquivos:**
- **`src/pages/Accounts.tsx`** — Importar `TransactionFormDialog` e `useTransactions`. Adicionar estado para controlar o dialog. Botão acima da lista. Após salvar, chamar `fetchData()` do `useBills` para atualizar a lista.

### 2. Filtros de Unidade e Frente no Dashboard

**O que muda:** O Dashboard recebe dois selects no topo (Unidade e Frente de Negócio). Ao selecionar, todos os KPIs, gráficos e alertas são filtrados pela unidade/frente escolhida.

**Arquivos:**
- **`src/hooks/useDashboard.ts`** — Aceitar parâmetros opcionais `unitId` e `frontId`. Aplicar filtros `.eq('unit_id', ...)` e `.eq('front_id', ...)` em todas as queries (transações do período, saldo total, alertas). A query de saldo total por contas (accounts) não é filtrada por unidade (saldo é da conta em si), mas as transações que compõem receitas/despesas sim.
- **`src/pages/Dashboard.tsx`** — Adicionar selects de Unidade e Frente no topo, usando `useSupabaseCrud` para buscar as opções. Passar os valores selecionados ao `useDashboard`. Opção "Todas" como padrão.

### Resumo técnico

| Tarefa | Arquivo | Complexidade |
|---|---|---|
| Botão + Dialog de novo lançamento em Contas | `Accounts.tsx` | Baixa (reutiliza TransactionFormDialog) |
| Dashboard aceitar filtros unit/front | `useDashboard.ts` | Média (adicionar params em 4 queries) |
| UI de filtros no Dashboard | `Dashboard.tsx` | Baixa (2 selects + estado) |

