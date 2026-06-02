## Objetivo

Transformar a Reconciliação Dashboard ↔ DRE em uma tela **acionável**: ao identificar uma divergência, o usuário corrige o lançamento direto na lista, vê um toast confirmando ("✓ Lançamento *X* corrigido") e os números/checklist se atualizam em tempo real, sem sair da tela.

## O que fica acionável

Cada item exibido no painel de detalhes (`DetailPanel`, usado tanto no Bridge quanto no Checklist) ganha uma coluna **Ações** com o(s) botão(ões) de correção apropriado(s) ao tipo de divergência:

| Divergência | Ação inline | Resultado no banco |
|---|---|---|
| **Provisionado** (pendente/agendado no período) | "Marcar como pago/recebido" | `status` → pago/recebido, `payment_date` = hoje |
| **Provisionado vencido** | "Marcar como pago/recebido" + "Reagendar vencimento…" (popover com date input) | mesmo acima / atualiza `due_date` |
| **Pago sem data de pagamento** | "Usar data de competência" / "Usar hoje" | preenche `payment_date` |
| **Pago fora da competência** | "Alinhar competência ao pagamento" | `competence_date` = `payment_date` |
| **Pago de período anterior** | "Alinhar competência ao pagamento" (move a competência para o período do caixa) | idem |
| **Sem categoria** | Select inline de categorias (filtrado por tipo receita/despesa) | atualiza `category_id` |
| **Sem unidade** | Select inline de unidades ativas | atualiza `unit_id` |
| **Sem frente** | Select inline de frentes ativas | atualiza `front_id` |
| **Valor líquido ≤ 0** | Botão "Abrir lançamento" (abre `TransactionFormDialog` em modo edição) | edição completa |

Cada ação dispara um único `UPDATE` em `transactions` (RLS já permite a admin/financeiro), depois:
1. `toast.success("Lançamento corrigido", { description: "<descrição truncada>" })`
2. Re-executa `generate(filters)` para recalcular Bridge, Checklist e Resumo.

## Detalhes técnicos

**`src/hooks/useReconciliation.ts`**
- Expor uma função `fixTransaction(id, patch, opts?)` que faz `supabase.from('transactions').update(patch).eq('id', id)` e, em sucesso, chama `await generate(lastFilters)` (guardar o último `filters` em `ref`).
- Retornar `{ data, loading, generate, fixTransaction, fixing }` (estado `fixing: string | null` p/ o id em processamento).
- Para o painel saber qual contexto disparou o item, propagar o tipo do bucket/flag ao montar `BucketDetail` (adicionar `kind: BucketKey | FlagKey` em `BucketDetail` *opcional*) ou passar isso como prop do `DetailPanel`.

**`src/components/reports/ReconciliationReport.tsx`**
- Novo componente `FixActions({ item, context, side, onFix })` que renderiza os botões/selects de acordo com `context` (bucket/flag).
- `DetailPanel` recebe `context` e `side` (receita/despesa) e injeta `<FixActions>` em cada linha de `items`.
- Para os selects inline, carregar **uma única vez** no `ReconciliationReport` as listas de `categories` (separadas por tipo), `units` e `business_fronts` ativos e passar via props/contexto local.
- `TransactionFormDialog` reaproveitado para o caso "Valor líquido ≤ 0" (já existe e aceita `editing`).
- Loading por linha: spinner pequeno no botão enquanto `fixing === item.id`.
- Após sucesso, mantém o painel aberto para o usuário ver que o item saiu da lista (o `generate` recalcula tudo).

**Aviso ao usuário**
- Usar `sonner` (`toast.success`) para confirmação rápida no canto.
- Mensagem padrão: `"✓ Corrigido"` + `description` com a descrição curta do lançamento e a mudança aplicada (ex.: `"Aluguel — marcado como pago em 02/06/2026"`).

## Fora do escopo

- Correções em massa (selecionar várias linhas e aplicar a mesma ação) — pode ser uma evolução futura.
- Edição de valor/imposto/parcelamento inline — continua via `TransactionFormDialog`.
- Sincronização realtime via canal Supabase — o refresh manual após cada fix já mantém tudo coerente para o usuário atual.
- Alterar regras/lógica de cálculo do hook — só adicionamos a função de update.
