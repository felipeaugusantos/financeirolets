## Objetivo

Permitir registrar lançamentos que **aparecem no DRE mas não no Caixa** (e vice-versa), para refletir corretamente situações como taxas de cartão, antecipações, transferências internas e ajustes — sem distorcer o saldo bancário nem o resultado.

Também criar um atalho específico para **vendas no cartão**, capturando valor **bruto** e **taxa**, com cálculo automático do valor líquido que entra no banco.

---

## 1. Modelo de dados (migração)

Adicionar 2 colunas booleanas em `transactions`:

- `affects_dre` (default `true`) — entra na DRE/competência.
- `affects_cashflow` (default `true`) — entra no Fluxo de Caixa e soma no saldo da conta.

Não muda nada do que já existe (todos os lançamentos antigos ficam `true/true`).

Backfill imediato: `UPDATE transactions SET affects_dre = true, affects_cashflow = true WHERE ...IS NULL`.

Index parcial em `(affects_cashflow) WHERE affects_cashflow = false` para filtros rápidos.

---

## 2. UX do seletor (no formulário de lançamento)

Logo abaixo da seção de valores, um bloco discreto chamado **"Onde este lançamento aparece?"** com 2 switches lado a lado:

- ✅ **Aparece no DRE** (resultado/competência) — *default ligado*
- ✅ **Aparece no Caixa** (saldo bancário/fluxo) — *default ligado*

Abaixo, um texto-resumo dinâmico em tom amigável:

```text
Ambos ligados   → "Lançamento normal: entra no resultado e movimenta o saldo."
Só DRE          → "Ex.: taxa de cartão, depreciação. Entra no resultado, não mexe no saldo."
Só Caixa        → "Ex.: transferência, empréstimo. Movimenta o saldo, não entra no resultado."
Ambos desligados → aviso vermelho "Esse lançamento não aparece em lugar nenhum. Tem certeza?"
```

Botões de atalho rápidos (chips clicáveis acima dos switches) para os 3 casos mais comuns:

- **Normal** (DRE + Caixa)
- **Taxa / Ajuste** (só DRE)
- **Transferência** (só Caixa)

---

## 3. Atalho "Venda no cartão" (automação opcional)

Novo botão no menu de Lançamentos: **"+ Venda no cartão"** (além do Novo lançamento normal). Abre um dialog específico com:

- Data, Unidade, Categoria, Conta (banco que recebe o líquido), Bandeira (Visa/Master/Elo/Pix etc.), Modalidade (Débito / Crédito à vista / Antecipação).
- **Valor bruto da venda** (R$).
- **Taxa** — entrada em **% ou R$** (toggle), com cálculo ao vivo do valor líquido.
- Campo opcional **"Taxa esperada (%)"** para alerta quando a real ficou acima do contratado (ex.: "Stone prometeu 5%, vieram 6,2%").

Ao salvar, o sistema cria **2 lançamentos vinculados**:

1. **Receita bruta** — valor cheio, `affects_dre=true`, `affects_cashflow=false` (não infla o caixa).
2. **Receita líquida (entrada no banco)** — valor líquido, `affects_dre=false`, `affects_cashflow=true`, categoria padrão "Recebimento de cartão".

Alternativa interna que pode ser configurada depois: bruto + despesa de taxa. Vamos com bruto/líquido por ser mais fiel ao extrato bancário (o que o usuário vê no banco é exatamente o líquido). Os dois lançamentos compartilham um `card_sale_group_id` (UUID) para rastreio e edição/exclusão em conjunto.

---

## 4. Impacto nos relatórios e telas existentes

- **DRE (`useDreReport`)**: filtrar `affects_dre = true`.
- **Fluxo de Caixa Realizado/Projetado (`useCashFlowReport`, `useCashFlowProjected`)**: filtrar `affects_cashflow = true`.
- **Dashboard KPIs (Saldo, Receitas, Despesas do mês)**: respeitar `affects_cashflow` para saldo bancário; receitas/despesas do mês respeitam `affects_dre`.
- **Contas a Pagar/Receber**: continuam mostrando tudo (operacional), mas badges visuais quando `!affects_cashflow` ou `!affects_dre`.
- **Lista de Lançamentos**: ícones pequenos ao lado do valor — 📊 (DRE) e 🏦 (Caixa) acesos/apagados, com tooltip.
- **Importação CSV**: aceitar as 2 colunas novas (opcionais, default true).

---

## 5. Permissões / auditoria

- Alterar `affects_dre`/`affects_cashflow` em lançamento já pago: somente Admin/Financeiro (registra em `audit_logs` automaticamente via trigger existente).
- Demais perfis veem o estado mas não editam pós-baixa.

---

## Detalhes técnicos

**Arquivos a tocar:**
- Migration: `add_visibility_flags_to_transactions.sql` (2 colunas + index + backfill).
- `src/hooks/useTransactions.ts`: incluir flags no insert/update.
- `src/components/transactions/TransactionFormDialog.tsx`: bloco "Onde aparece" + chips.
- `src/components/transactions/CardSaleDialog.tsx` (**novo**): atalho cartão com bruto/taxa/líquido.
- `src/pages/Transactions.tsx`: botão "+ Venda no cartão" ao lado do Novo.
- `src/hooks/useDreReport.ts`, `useCashFlowReport.ts`, `useCashFlowProjected.ts`, `useDashboard.ts`: aplicar filtros de visibilidade.
- `src/components/transactions/TransactionList.tsx`: badges 📊/🏦.
- `src/pages/settings/ImportExportSettings.tsx`: mapear colunas extras no CSV.
- Memory: novo arquivo `mem://features/transacoes/visibilidade-dre-caixa.md`.

**Sem mudanças** em: estrutura DRE, orçamento, rateio, anexos.
