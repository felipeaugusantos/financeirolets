

# Plan: Fix 3 Bugs Reportados pelo Usuário

## Bug 1: Exclusão não persiste (lançamento retorna ao atualizar página)

**Causa raiz**: A função `remove` em `useTransactions.ts` faz remoção otimista da UI, mas quando o Supabase bloqueia o DELETE via RLS, ele **não retorna erro** — simplesmente não deleta nenhuma linha. O código verifica `error` mas não verifica se alguma linha foi realmente deletada.

Além disso, não existe uma política de DELETE explícita para usuários comuns (apenas admin/financeiro via ALL). Porém os dois usuários são admin, então o problema pode ser outro: a tabela `transaction_allocations` tem FK `ON DELETE CASCADE`, e `attachments` não tem CASCADE — se houver attachments vinculados, o delete pode falhar.

**Correção**:
- Alterar `remove` para usar `.delete().eq('id', id).select()` e verificar se retornou linhas
- Deletar attachments vinculados antes de deletar a transação
- Adicionar `.select('count')` ou verificar o retorno para confirmar que o delete funcionou
- Se falhar, reverter a UI e mostrar mensagem de erro clara

## Bug 2: Data deslocada em 1 dia (01/04 vira 31/03)

**Causa raiz**: `new Date("2026-04-01")` interpreta a string ISO como UTC meia-noite. No fuso horário do Brasil (UTC-3), isso se torna 31/03 às 21h. Isso afeta:

- `TransactionFormDialog.tsx` linhas 86-88: ao carregar datas do banco para edição (`new Date(initialData.competence_date)`)
- `useTransactions.ts` linha 154: cálculo de datas de parcelas (`new Date(input.due_date)`)
- `TransactionList.tsx`: exibição com `new Date(tx.competence_date)`

**Correção**:
- Criar função utilitária `parseDateUTC(dateStr)` que usa `new Date(dateStr + 'T12:00:00')` para evitar problemas de timezone
- Aplicar em todos os pontos que convertem string de data ISO para objeto Date
- No formulário, usar esta função ao carregar `initialData`
- Na lista, usar esta função antes de `format()`

## Bug 3: Rateio entre unidades não funciona

**Causa raiz**: A tabela `transaction_allocations` está **completamente vazia** no banco. Os rateios configurados no formulário não estão sendo salvos. Investigação mostra que:

1. O formulário coleta allocations corretamente e passa para `onSave`
2. O `create` function insere allocations **após** inserir transações
3. Possível problema: o `insert` de allocations falha silenciosamente (o erro não é tratado/exibido)

**Correção**:
- Adicionar tratamento de erro no insert de allocations em `create()` e `update()`
- Adicionar log/toast quando allocations falham
- Verificar que os valores de `unit_id` passados são UUIDs válidos (não `"__none__"`)
- No `updateAllocation`, garantir que `__none__` é convertido para `undefined`/`null` antes de salvar
- Testar o fluxo completo de criação com rateio

## Arquivos a editar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/utils.ts` | Adicionar `parseDateUTC()` |
| `src/hooks/useTransactions.ts` | Fix delete (verificar retorno), fix date parsing, fix allocation error handling |
| `src/components/transactions/TransactionFormDialog.tsx` | Usar `parseDateUTC` ao carregar datas |
| `src/components/transactions/TransactionList.tsx` | Usar `parseDateUTC` na exibição |

## Detalhes técnicos

```text
Bug 1 (Delete):
  remove() → delete().eq().select() → check data.length > 0
  + delete attachments first

Bug 2 (Date):
  parseDateUTC("2026-04-01") → new Date("2026-04-01T12:00:00")
  Applied in: FormDialog load, List display, installment calc

Bug 3 (Rateio):
  - Add error handling on allocation insert
  - Ensure __none__ → null conversion
  - Toast on failure
```

