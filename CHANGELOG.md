# Changelog — Let's Finance

Versões publicadas e validadas com o cliente. A versão exibida no cabeçalho do
app vem de `APP_VERSION` em `src/lib/appEnv.ts` — atualizar os dois juntos.

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
