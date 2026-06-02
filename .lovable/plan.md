# Checkup Let's Finance — achados e plano de correção

Auditei Dashboard, DRE, Reconciliação e os testes de segurança que construímos hoje. Abaixo o resumo dos problemas encontrados e o plano de correção.

## Achados por severidade

### 🔴 Críticos (afetam números mostrados ao usuário)

| # | Arquivo | Problema |
|---|---------|----------|
| C1 | `src/hooks/useDreReport.ts:130–134` | DRE Competência sem `onlyRealized` **inclui transações `cancelado`** — Dashboard e Reconciliação excluem. Bridge nunca fecha. |
| C2 | `src/hooks/useReconciliation.ts:270–273` | Duas queries do `transactions` **sem `.limit()`** → truncam em 1000 linhas silenciosamente. Identidades quebram e Checklist marca falsos erros. |
| C3 | `src/hooks/useDashboard.ts:90–95` e `203–208` | Idem no Dashboard: gráficos de 6 meses e `saldoTotal` all-time. |
| C4 | `src/hooks/useDreReport.ts:125–135` | Idem no DRE (`fetchPeriodValues`, período atual + anterior + orçado). |

### 🟡 Médios (divergências entre telas / regras sutis)

| # | Arquivo | Problema |
|---|---------|----------|
| M1 | `src/hooks/useReconciliation.ts:365` | Lançamento `pago` sem `payment_date` cai falsamente em `pagoForaDaCompetencia` (porque `inRange(null,…)=false`). |
| M2 | `src/hooks/useDashboard.ts:125–131` | Gráfico mensal filtra por `competence_date` mas bucketa barras por `payment_date` — pagamentos de competência da janela mas data de pagamento fora desaparecem. |
| M3 | `src/hooks/useDashboard.ts:153–155` | `contasAtrasadas` ignora `agendado` — Reconciliação inclui. |
| M4 | `src/components/reports/ReconciliationReport.tsx:300–302` | `Bridge` chama `BridgeImpl({…})` como função, não como JSX → viola Rules of Hooks. |
| M5 | `src/hooks/useReconciliation.ts:96` | Linha "− Provisionado" em `makeBridge` tem `key:'provisionado'` duplicado — abre o mesmo DetailPanel duas vezes. |
| M6 | DRE × Reconciliação | Derivado de C1: tratamento divergente de `cancelado` quebra confiança da Bridge. |
| M7 | `src/test/rls.test.ts:5` | Usa `VITE_SUPABASE_PUBLISHABLE_KEY`; sem fallback/validação, testes podem passar vacuamente se var não existir. |

### ⚪ Cosméticos (não bloqueantes)

- Co1 `useDashboard.ts:231–232` — lista `overdueBills` limitada a 20 enquanto KPI conta tudo.
- Co2 `DreReport.tsx:186–198` — switch "Somente realizado" some ao trocar para Caixa sem feedback.
- Co3 `useReconciliation.ts:108` — `todayISO()` helper externo, irrelevante.
- Co4 `src/pages/Reports.tsx:26` — grid `md:grid-cols-3` com 4 cards.

## Plano de correção

Vou tratar **todos os 🔴 críticos e 🟡 médios** em uma única passada. Cosméticos ficam para depois (ou junto, se sobrar espaço).

### 1. Padronizar exclusão de `cancelado` e limites

- `useDreReport.ts`: adicionar `.not('status','eq','cancelado')` em `fetchPeriodValues` ANTES dos branches de regime/onlyRealized.
- `useDashboard.ts`, `useDreReport.ts`, `useReconciliation.ts`: adicionar `.limit(10000)` em todas as queries de `transactions` listadas em C2/C3/C4 e logar warning se `data.length === 10000` (provável overflow). Criar helper `fetchAllTransactions(query)` opcional se ficar limpo, mas o mínimo é o `.limit()`.

### 2. Reconciliação — regras finas

- `useReconciliation.ts` (M1): mudar o bucket `pagoForaDaCompetencia` para exigir `tx.payment_date != null` antes de cair lá. Lançamentos `pago` sem `payment_date` viram um novo flag `pagoSemData` no checklist (severidade `warn`).
- `useReconciliation.ts` (M5): remover `key:'provisionado'` da linha "− Provisionado" em `makeBridge` (continua visualmente como delta, mas não abre detalhe duplicado).
- `ReconciliationReport.tsx` (M4): substituir `return BridgeImpl({…})` por inlinear o conteúdo direto em `Bridge` (remover wrapper) — corrige Rules of Hooks.

### 3. Dashboard — alinhar com Reconciliação

- `useDashboard.ts` (M2): trocar a query do gráfico para buscar transações por `competence_date OU payment_date` na janela de 6 meses (`.or('competence_date.gte.X,payment_date.gte.X')` + filtro `lte` simétrico), garantindo que toda barra do gráfico tenha as transações relevantes.
- `useDashboard.ts` (M3): incluir `agendado` em `contasAtrasadas`, alinhando com a flag `provisionadoVencido` da Reconciliação.

### 4. Testes

- `src/test/rls.test.ts` (M7): no topo, `if (!SUPABASE_ANON_KEY) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY ausente — testes RLS exigem a env var')`. Garante que CI não passe vacuamente.

### 5. Cosméticos (incluo se for rápido)

- Co4: `md:grid-cols-2 lg:grid-cols-4` em `Reports.tsx`.
- Co1: subir o limite de `overdueBills` para `.limit(100)` ou exibir "+N mais" quando excede.

## Fora de escopo
- Refatorar `useDashboard` em camadas (saldo / KPIs / gráfico separados).
- Paginação real (cursor) — apenas elevar o `.limit()` para evitar truncamento silencioso.
- Persistência do estado dos filtros entre telas.
- Mudanças visuais no Checklist/RulesBreakdown.

## Verificação pós-fix
- Rodar `tsc --noEmit` e os testes existentes (`has-role-usage`, `rls`).
- Gerar Reconciliação para o mês corrente e conferir se os blocos "Identidade Competência" e "Identidade Caixa" exibem ✓ em Receitas e Despesas.
- Comparar manualmente Dashboard (com toggle "Incluir provisionados" OFF) com o DRE Competência (com "Somente realizado" ON) — devem coincidir centavo a centavo.
