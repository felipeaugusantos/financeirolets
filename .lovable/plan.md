# Correção pontual das divergências de julho/2026

Reconferi item a item no extrato e no banco antes de propor qualquer alteração. **Quatro dos cinco IDs conferem exatamente com o diagnóstico. Um item do seu pedido não confere e por isso não será criado como novo lançamento.**

## Divergência encontrada na reconferência (item 1, Café 01/07 — R$ 30,39)

O lançamento **não está ausente**. Ele já existe:

- ID `5035c345-a319-4dc8-88ec-d668c87df097`
- Conta Bradesco Café, receita, `MASTER ANTECIPACAO STONE INSTITUICAO DE PAGAMENTO`, R$ 30,39, status recebido
- `payment_date` = **vazia** (é o "1 pago sem data de pagamento" de julho)
- `competence_date` = **30/07/2026**, enquanto o extrato mostra o crédito em **01/07/2026**

Criar um novo lançamento aqui geraria duplicidade. A correção correta é preencher a data. **Proposta:** definir `payment_date = 01/07/2026` e `competence_date = 01/07/2026` (a competência atual, 30/07, não tem respaldo no extrato). Se preferir manter a competência em 30/07, me avise — só o `payment_date` já fecha o Fluxo de Caixa.

## O que será feito

### A. Criar 2 lançamentos realmente ausentes
Copiando exatamente os campos dos Stone equivalentes já existentes da mesma conta (categoria, unidade, frente, forma de pagamento, status, flags):

| Conta | Data | Descrição | Valor |
|---|---|---|---|
| Bradesco Café | 10/07/2026 | VISA ANTECIPACAO STONE INSTITUICAO DE PAGAMENTO | 205,95 |
| Bradesco Café | 29/07/2026 | STONE VISA DEBITO STONE INSTITUICAO DE PAGAMENTO | 104,05 |

### B. Corrigir 4 valores (só `amount` e `net_amount`)

| ID | Conta / data | De | Para |
|---|---|---|---|
| `b9a6c6ce…` | Café 16/07 — STONE ELO DEBITO | 30,71 | 71,78 |
| `b75fb681…` | Café 23/07 — ELO ANTECIPACAO | 147,18 | 40,91 |
| `0f47741b…` | Fábrica 29/07 — PIX Pahnova | 337,20 | 320,80 |
| `ccceccb3…` | Boulevard 27/07 — VISA ANTECIPACAO | 450,52 | 450,42 |

Nada além do valor muda: descrição, conta, unidade, categoria, status, datas e flags ficam intactos.

### C. Cancelar (não excluir) `ec39af03…`
Fábrica 29/07, STONE VISA DEBITO R$ 105,95. Reconferido: o extrato da Fábrica não tem nenhum crédito Stone em julho (os únicos créditos de 29/07 são 2.652,60, 320,80 e 337,20). Ação: `status = 'cancelado'`. O registro permanece no banco e no histórico.

### D. Corrigir a data do PIX de R$ 72,50
Localizado um único correspondente: `2c538855…`, Café, despesa, `PIX ENVIADO DES: SAMUEL SCATENA SCANDI 21/07`, hoje com `payment_date = 22/07`. O extrato registra a saída em 21/07 (doc 2235362). Ação: `payment_date = 21/07/2026`. A competência (22/07) fica como está, salvo sua orientação.

### E. Não tocar
PIX Martinho & Souza (R$ 119.535,68) e `initial_balance` das contas permanecem exatamente como estão.

## Auditoria
Todas as alterações passam pelo trigger `audit_transactions`, que grava `old_data`/`new_data` completos, usuário e horário em `audit_logs` — permitindo ver valor antes/depois e data antes/depois. Como as correções serão aplicadas por migração no banco, o `user_id` do log fica nulo; para preservar autoria eu registro em paralelo um log explícito por lançamento via `log_transaction_action`, com contexto `conciliacao-julho-2026`.

## Validação (executada depois, somente leitura)
Reconciliação independente por conta e consolidada contra os extratos. Resultado esperado após as correções:

| Conta | Entradas | Saídas |
|---|---|---|
| Fábrica | 46.842,17 | 33.992,97 |
| Boulevard | 8.556,55 | 8.039,35 |
| Café | 87.546,31 | 113.028,98 |
| Franqueadora | 75.848,49 | 29.341,56 |
| **Total** | **218.793,52** | **184.402,86** |

Movimentação líquida R$ 34.390,66, diferença R$ 0,00 por conta e consolidada. Conferência prévia dos deltas: Fábrica −16,40 −105,95; Boulevard −0,10; Café +30,39 +41,07 −106,27 +205,95 +104,05 — fecha exatamente. Se sobrar qualquer centavo, eu paro e reporto em vez de fazer novas correções.

Depois recalculo o DRE de julho e informo receitas, despesas, resultado, a variação frente ao anterior (+R$ 122,35 estimados de receita, resultado indo de 33.154,94 para ~33.277,29) e a origem de cada centavo da mudança. A pendência dos R$ 119.535,68 do PIX Martinho & Souza segue destacada — o DRE de julho não é dado por validado enquanto ela não for definida.

## Detalhes técnicos
- Migração SQL única, com `UPDATE ... WHERE id = ...` por ID e `INSERT` explícito dos 2 lançamentos novos; nenhum `DELETE`.
- Novos lançamentos herdam `category_id`, `unit_id`, `front_id`, `payment_method`, `status`, `affects_dre`, `affects_cashflow` do Stone equivalente da mesma conta (`99a1b048…` como referência).
- Nenhuma alteração de código de aplicação nesta etapa.
