

# Diagnóstico Completo e Plano de Correções — Let's Finance

## Achados da Análise de Dados

### Dados Atuais no Banco
- **15 transações** (2 receitas, 13 despesas), todas com status "pago"
- **0 allocations** (rateios) — tabela `transaction_allocations` vazia
- **9 transações sem categoria** ou **sem unidade** — essas não aparecem no DRE
- Unidades com dados: Let's Café (5 tx), Let's Boulevard (2 tx); demais 5 unidades sem lançamentos

### Problemas Identificados

#### 1. Transações sem categoria não aparecem no DRE
5 transações (TESTE, Nutricionista x2, Pagamento Motoca, Royalties Monte Alto) não têm `category_id`. Sem categoria → sem vínculo com linha DRE → **invisível nos relatórios**. Isso é esperado pelo design, mas o usuário precisa de um alerta visual.

**Ação**: Adicionar banner de alerta na página de Lançamentos informando quantas transações estão "sem categoria" e não aparecerão nos relatórios.

#### 2. Transações sem unidade distorcem o DRE filtrado
8 transações não têm `unit_id` (incluindo R$ 5.620 de Impostos e R$ 5.000 de Royalties). Ao gerar DRE por unidade, esses valores somem. No consolidado, aparecem.

**Ação**: Já existe lógica para "Sem unidade" no DRE Comparativo. Verificar que funciona corretamente e que o alerta visual aparece.

#### 3. Rateio continua com tabela vazia
A correção anterior no código foi aplicada (tratamento de `__none__` → `null`), mas **nenhum rateio foi salvo** de fato. Pode ser que o usuário não tenha tentado novamente após o fix, ou há um problema adicional no formulário.

**Ação**: Testar o fluxo de criação de rateio no formulário para garantir que os dados chegam à tabela.

#### 4. Dashboard: Saldo Total = receitas - despesas (all-time)
O cálculo está correto: soma todos os pagos. Com os dados atuais: R$ 5.422,18 (receitas) - R$ 11.856,45 (despesas) = **R$ -6.434,27**. Nenhum saldo inicial nas contas bancárias.

**Ação**: Sugerir ao usuário que configure saldos iniciais nas contas bancárias para refletir a realidade.

#### 5. DRE: Sign de despesas inverte o sinal
Grupos 2 (Despesas Variáveis) e 4 (Despesas Fixas) têm `sign: -1`, o que faz valores de despesas aparecerem como negativos no DRE. Isso é o **comportamento correto** para DRE contábil (receitas positivas, despesas negativas).

**Sem ação necessária** — está correto.

#### 6. Correlação DRE ↔ Transações
- "Vendas Recebimento Loja" (código 1.1.01) = R$ 422,18 ← transação "Stone Master Debito" ✅
- "Salários Fábrica" (código 4.5.01) = R$ 1.295,00 ← Barbara + Nutricionista ✅
- "Energia Elétrica" (código 4.3.01) = R$ 1.740,70 ← CPFL + Cpfl Relogio 1 ✅
- Transações sem categoria (R$ 7.470): **NÃO aparecem** no DRE

## Plano de Implementação

### 1. Alerta de transações incompletas na lista de Lançamentos
Adicionar um banner no topo da lista avisando: "X lançamentos sem categoria — não aparecerão nos relatórios DRE".

**Arquivo**: `src/pages/Transactions.tsx`

### 2. Alerta de transações sem unidade no Dashboard
Quando há transações sem unidade, mostrar indicador sutil no Dashboard.

**Arquivo**: `src/hooks/useDashboard.ts` (adicionar contagem) + `src/pages/Dashboard.tsx` (exibir)

### 3. Verificar e corrigir formulário de rateio
Inspecionar `TransactionFormDialog.tsx` para garantir que os `allocations` são passados corretamente no `onSave`. Adicionar log temporário se necessário.

**Arquivo**: `src/components/transactions/TransactionFormDialog.tsx`

### 4. Melhorar feedback de dados no DRE Comparativo  
Quando uma coluna "Sem unidade" aparece com valores significativos, destacá-la visualmente.

**Arquivo**: `src/components/reports/DreComparativo.tsx`

### 5. Melhorar cálculo do Dashboard para BI
O Dashboard já tem KPIs básicos. Para torná-lo um verdadeiro BI:
- Adicionar **margem de contribuição** (receitas - despesas variáveis) como KPI
- Adicionar percentual de variação mês a mês nos cards

**Arquivo**: `src/hooks/useDashboard.ts` + `src/pages/Dashboard.tsx`

## Resumo de Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Transactions.tsx` | Banner de transações sem categoria |
| `src/hooks/useDashboard.ts` | Contagem de transações sem categoria/unidade, margem de contribuição |
| `src/pages/Dashboard.tsx` | Exibir alertas e novo KPI de margem |
| `src/components/transactions/TransactionFormDialog.tsx` | Validar passagem de allocations no save |
| `src/components/reports/DreComparativo.tsx` | Destacar coluna "Sem unidade" |

