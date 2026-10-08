# Changelog — Let's Finance

Versões publicadas e validadas com o cliente. A versão exibida no cabeçalho do
app vem de `APP_VERSION` em `src/lib/appEnv.ts` — atualizar os dois juntos.

## 1.2.5 — 08/10/2026
- Dashboard por competência (padrão) ou caixa.
- DRE: lançamentos por linha, listas de fora do DRE e sem unidade; linha 1.1.10.
- Marcador de estorno; cartão com data do lançamento e competência.
- Rateio das regras respeitado em "Criar lançamento".

## 1.2.4 — 07/10/2026
- Dashboard calculado no banco (`dashboard_summary`), erros visíveis, filtros na URL, detalhe dos cartões, Resultado e botão Atualizar.
- Nova tela de pré-lançamento do cartão (cabeçalho/rodapé fixos) e Marcar/Desmarcar todas ao lançar linhas do extrato.
- Desvincular e excluir remove só lançamentos criados pelo extrato (SQL 10).
- Salvar/editar/excluir lançamentos de forma atômica (SQL 09).

## 1.2.3 — 07/10/2026
- Desvincular conciliação exclui o lançamento (opção de só desvincular).
- Filtros da conciliação lembrados; seleção limpa ao trocar conta/período.
- Lançar automaticamente: seleção respeitada, colunas editáveis, texto completo.
- Total do Criar lançamento corrigido; % conciliado; busca por valor.
- Regra Kaique → Pro Labore Sócios.

## 1.2.2 — 24/09/2026
- Divisão padrão por categoria (`category_split_rules`) e botão "Nova regra simples".
- 50 regras de conciliação (37 atualizadas + 13 novas).
- "Lançar pelas regras" só para Admin/Financeiro; tarifas fora da trava de duplicidade.
- Relatório Fluxo de Caixa por Unidade.
- Importação CSV aceita coluna Unidade (com rateio igual para várias).

## 1.2.1 — 24/09/2026
- Vínculo por descrição ignora a data no fim do histórico ("... 04/09").
- Quadro "Nomes repetidos sem regra" oculto.
- "Lançar pelas regras": só regras de baixo risco vêm marcadas; demais para conferência.

## 1.2.0 — 20/09/2026
- Regras de conciliação avançadas: por conta, exceções de texto, faixa de valor,
  unidade da conta do extrato e rateio dentro da regra (validação de 100%).
- Aba de Simulação e botão "Lançar pelas regras" com conferência, trava de
  duplicidade (descrição + valor + 5 dias na mesma conta) e quadro de nomes
  repetidos sem regra.
- Conciliação de Cartão (`/conciliacao/cartao`) com importação .xlsx/.csv e
  anti-duplicidade por hash.
- Assistente Kaikin com histórico por usuário (`kaikin_messages`).
- Escrita de conciliação bancária, de cartão e de regras restrita a Admin e
  Financeiro.
- Dados: 37 regras de conciliação validadas e unidade padrão por conta.

## 1.1.0 — 31/08/2026
> Padrão do projeto: a cada publicação, registrar as mudanças aqui **e** em
> `src/data/releases.ts` (tela Novidades + PDF da equipe), agrupadas por data
> de publicação.
- Tela **Novidades** (`/novidades`) com o que mudou em linguagem de cliente e
  botão para baixar o PDF com seção técnica para a equipe.
- Conciliação OFX: vínculo automático estrito (data + descrição + valor),
  ícone de similaridade, pareamento 1:1 de linhas duplicadas, criação em lote
  e agrupada, visão em painéis, desfazer conciliação, reprocessar arquivo e
  revalidar importados.
- Regras de Conciliação em menu próprio, com CRUD validado e simulação.
- DRE Gerencial com margens e EBITDA; pró-labore após o resultado líquido.

## 1.0.1 — 27/08/2026
- Totais de Lançamentos (Receitas/Despesas/Saldo) passam a somar **todos** os
  lançamentos do filtro por agregação no banco, em vez das 1.000 primeiras linhas
  carregadas. Lançamentos cancelados saem dos totais.
- Ordenação estável na paginação (desempate por `id`), corrigindo duplicidade
  de linhas na soma.
- Aviso na tela quando a lista exibida é apenas um recorte do período.
- Relatório do período na Conciliação Bancária (OFX): importadas, vinculadas,
  criadas, ignoradas, taxa de cobertura e exportação das pendências em CSV/PDF.
- Ambiente de homologação identificado por faixa no topo do app.

## 1.0.0 — Base
- Dashboard, Lançamentos, Contas a Pagar/Receber, DRE, Fluxo de Caixa,
  Reconciliação, Conferência de lançamentos, Conciliação Bancária (OFX) e Kaikin.
