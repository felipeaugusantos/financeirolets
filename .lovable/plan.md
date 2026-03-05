

# Fase 3: Formulário Completo de Lançamentos Financeiros

## Visão Geral
Transformar a página de Lançamentos (skeleton) em um módulo funcional completo com listagem, criação, edição, filtros e upload de comprovantes.

## 1. Storage Bucket (Migration SQL)
- Criar bucket `attachments` no Supabase Storage para upload de comprovantes
- Criar políticas RLS no bucket: authenticated users podem fazer upload, leitura pública

## 2. Componente `TransactionFormDialog`
Novo arquivo: `src/components/transactions/TransactionFormDialog.tsx`

Formulário multi-seção em Dialog/Sheet com os campos:
- **Tipo**: receita / despesa (toggle visual)
- **Descrição**: texto obrigatório
- **Valor bruto** + **Impostos** (auto-calcula valor líquido)
- **Data de competência** (DatePicker com Calendar)
- **Data de vencimento** (DatePicker)
- **Data de pagamento** (DatePicker, opcional)
- **Status**: pendente / pago / recebido / cancelado / agendado (Select)
- **Método de pagamento**: dinheiro, pix, cartão, boleto, etc. (Select)
- **Categoria**: Select populado do banco (filtrado por tipo receita/despesa)
- **Conta financeira**: Select populado do banco
- **Parceiro**: Select populado do banco
- **Unidade**: Select populado do banco
- **Frente de negócio**: Select populado do banco
- **Parcelas**: checkbox "Parcelado?" → campos de número de parcelas (gera N registros com installment_group_id compartilhado)
- **Rateio por unidade/frente**: seção expansível para adicionar múltiplas linhas de alocação (percentual ou valor fixo)
- **Observações**: textarea
- **Comprovantes**: área de upload de arquivos (múltiplos)

## 3. Componente `TransactionFilters`
Novo arquivo: `src/components/transactions/TransactionFilters.tsx`

Painel de filtros expansível com:
- Período (data início / fim)
- Tipo (receita/despesa)
- Status
- Categoria, Conta, Unidade, Frente, Parceiro

## 4. Componente `TransactionList`
Novo arquivo: `src/components/transactions/TransactionList.tsx`

- Tabela responsiva (Cards no mobile) listando transações
- Colunas: Data, Descrição, Categoria, Valor, Status, Ações
- Badge colorido para tipo (verde=receita, vermelho=despesa)
- Badge de status
- Ações: editar, excluir, marcar como pago/recebido

## 5. Hook `useTransactions`
Novo arquivo: `src/hooks/useTransactions.ts`

Hook dedicado (não reutiliza `useSupabaseCrud` por ser mais complexo):
- Fetch com joins (category name, account name, partner name, unit name)
- Filtros dinâmicos
- Criação com suporte a parcelas (gerar N registros)
- Criação de alocações (transaction_allocations)
- Upload de attachments ao storage e registro na tabela attachments
- Paginação

## 6. Página `Transactions.tsx` (reescrita)
- Integra TransactionList, TransactionFilters, TransactionFormDialog
- Botão "Novo" abre o dialog
- Busca textual + filtros avançados
- Totalizadores no topo (total receitas, total despesas, saldo)

## 7. Correção RLS
- As políticas atuais nas tabelas `transactions`, `attachments`, `transaction_allocations` estão como `RESTRICTIVE`. Precisam ser convertidas para `PERMISSIVE` (mesmo padrão aplicado nas outras tabelas na Fase 2) para que operações de INSERT funcionem corretamente.

## Arquivos a criar/editar
| Arquivo | Ação |
|---|---|
| `supabase/migrations/...` | Criar bucket + fix RLS policies |
| `src/hooks/useTransactions.ts` | Criar |
| `src/components/transactions/TransactionFormDialog.tsx` | Criar |
| `src/components/transactions/TransactionFilters.tsx` | Criar |
| `src/components/transactions/TransactionList.tsx` | Criar |
| `src/pages/Transactions.tsx` | Reescrever |

## Detalhes Técnicos
- DatePicker usa `Calendar` + `Popover` com `pointer-events-auto`
- Upload usa `supabase.storage.from('attachments').upload()`
- Parcelas: ao salvar com N parcelas, gera N registros com `installment_group_id` compartilhado, valores divididos igualmente, vencimentos mensais incrementais
- Rateio: salva na tabela `transaction_allocations` vinculada ao `transaction_id`
- Filtros persistem via state local (não URL por enquanto)

