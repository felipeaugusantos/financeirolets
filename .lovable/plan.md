# Explicações em linguagem simples na Reconciliação

## Objetivo
Tornar a tela de Reconciliação Dashboard ↔ DRE compreensível para usuários não-contábeis, traduzindo cada regra técnica (competência vs caixa, provisionados, pagos de período anterior, etc.) em frases simples conectadas aos valores reais calculados.

## Onde
Arquivo único: `src/components/reports/ReconciliationReport.tsx` (o cálculo em `useReconciliation.ts` já entrega tudo o que precisamos — não muda).

## O que adicionar

### 1. Campo `plain` em cada RULE
Estender o array `RULES` com uma função `plain(side)` que retorna uma frase contextualizada com os valores reais formatados, por exemplo:

- **Dashboard**: "Tudo que foi efetivamente pago/recebido neste período e cuja data de competência também cai aqui. Hoje são R$ X em N lançamentos — é o número que aparece no Dashboard."
- **Provisionado**: "São R$ X em N contas com data deste período mas que ainda não foram pagas/recebidas. O Dashboard ignora; o DRE Competência inclui."
- **DRE Competência (cheio)**: "Soma tudo que pertence ao mês pela data de competência, esteja pago ou não. Dá R$ X = Dashboard (R$ Y) + Provisionado (R$ Z)."
- **DRE Competência (somente realizado)**: "Mesma lógica do Dashboard: só conta o que já entrou/saiu. Por isso bate exatamente: R$ X."
- **Pagos de período anterior**: "N pagamentos de R$ X feitos agora, mas referentes a meses anteriores. Entram no caixa deste mês, mas não no DRE por competência."
- **Pagos fora da competência**: "N lançamentos de R$ X cuja competência é deste mês, mas o pagamento caiu fora. Aparecem no DRE Competência, mas não no caixa deste período."
- **DRE Caixa**: "Só olha a data de pagamento. R$ X = Dashboard (R$ Y) + pagos de antes (R$ Z) − pagos fora (R$ W)."

### 2. UI dentro de `RulesBreakdown`
Em cada card de regra, adicionar abaixo de "Regra" e "Fórmula" um terceiro bloco:

- Label: **"Em palavras"** com ícone `MessageCircle` (lucide).
- Texto da frase com os valores reais em **negrito** (ex.: `<strong>R$ 15.000,00</strong>`).
- Estilo: `text-xs leading-relaxed text-foreground/80` num bloco com fundo `bg-primary/5` arredondado.

### 3. Banner de leitura rápida no topo
Acima dos dois cards de `RulesBreakdown`, adicionar um único Card "Resumo em uma frase" que monta a história do período:

> "Neste período seu Dashboard mostra **R$ X em receitas** e **R$ Y em despesas** (já realizadas). O DRE pela competência adiciona **R$ Z provisionado**; o DRE pelo caixa ajusta em **+R$ A** (pagos de antes) e **−R$ B** (pagos fora), chegando a **R$ C**."

Valores e cores semânticas (success/destructive) usando tokens do design system.

### 4. Remover/encolher o card "Como ler"
O card genérico atual no fim da tela vira redundante — substituir por um pequeno rodapé linkando o novo conteúdo, ou removê-lo.

## Detalhes técnicos
- Sem alteração no hook nem no banco — toda info necessária já está em `SideData`.
- Frases geradas via template strings; helper `fmt()` já existe para moeda.
- Manter responsivo (grid `lg:grid-cols-2`) e tokens semânticos (`bg-primary/5`, `text-success`, `text-destructive`).
- Reutilizar `Card`, `Badge`, `cn` já importados.

## Fora de escopo
- Mudanças em DRE, Dashboard ou hook `useReconciliation`.
- Tradução para outros idiomas.
- Exportação PDF do conteúdo novo (pode ser pedido depois).
