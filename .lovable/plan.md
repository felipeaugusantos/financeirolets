# Alinhar Dashboard ↔ DRE: tratar Provisionados

## Diagnóstico da diferença

Ao comparar o **Dashboard** com o **DRE em Competência**, os valores divergem porque cada tela usa critérios diferentes para considerar uma transação:


| Tela                                                    | O que entra hoje                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Dashboard (Receitas/Despesas do Mês, gráficos, ranking) | Apenas transações com `status = pago / recebido` no mês de competência                                           |
| DRE em Competência                                      | **Todas** as transações do período, inclusive `pendente`, `agendado` e vencidas — independentemente do pagamento |
| DRE em Caixa                                            | Só pagas/recebidas, pela `payment_date`                                                                          |
| Saldo Total                                             | Pagas + saldo inicial das contas                                                                                 |


Resultado: uma despesa de R$ 15.000 lançada em competência mas ainda **não paga** aparece no DRE Competência e **não aparece** no Dashboard, gerando a sensação de "sumiu". É comportamento contábil correto (competência ≠ caixa), mas falta uma chave que torne isso visível e controlável.

## O que vai ser feito

### 1. Toggle "Incluir provisionados" no Dashboard

Adicionar no header do Dashboard, ao lado dos filtros de Unidade/Frente, um switch **"Incluir provisionados"** (default: desligado).

- **Desligado** (padrão atual): KPIs/gráficos consideram só `pago / recebido` → reflete o caixa realizado.
- **Ligado**: passa a somar também `pendente` e `agendado` pela `competence_date` → bate com o DRE Competência.

Quando ligado:

- Cards "Receitas do Mês", "Despesas do Mês" e "Margem" mostram valor combinado, com sub-rótulo discreto separando `Realizado R$ X • Provisionado R$ Y`.
- Gráfico "Receitas vs Despesas (6 meses)" ganha barras empilhadas (parte sólida = realizado, parte hachurada/clara = provisionado).
- Pizza de "Despesas por Categoria" inclui pendentes.
- Ranking de Unidades inclui pendentes.

### 2. Toggle equivalente no DRE em Competência

Adicionar no DRE um switch **"Somente realizado"** (default: desligado). Quando ligado, o regime de competência passa a considerar só `pago / recebido` — mesma lógica do Dashboard com toggle desligado. Assim os dois conversam.

### 3. Transição automática provisionado → realizado

Já acontece naturalmente: ao dar baixa numa conta (`status` vira `pago / recebido` + preencher `payment_date`), a transação sai do bucket "provisionado" e entra no "realizado" em todas as telas. Nenhuma mudança de dados; só garantimos que isso fica visível com o toggle.

### 4. Banner explicativo

Pequeno tooltip/ícone de info ao lado dos cards "Receitas/Despesas do Mês" e do regime do DRE explicando em uma frase: *"Realizado = pagamentos efetivados. Provisionado = lançamentos do mês ainda não pagos."*

## Detalhes técnicos (para referência)

- `src/hooks/useDashboard.ts`: aceitar `includeProvisioned?: boolean` no `DashboardFilters`. Onde hoje há `isPaid = status === 'pago' || status === 'recebido'`, passar a aceitar também `pendente`/`agendado` quando o flag estiver ativo. Manter `payment_date` para realizado e usar `competence_date` para provisionado dentro do `monthMap`. Retornar campos extras `receitasProvisionadas`, `despesasProvisionadas` para exibir o split nos cards.
- `src/pages/Dashboard.tsx`: novo `Switch` (componente shadcn já disponível) no header; consumir os novos campos; ajustar `BarChart` para stacked com 4 séries (`receitasReal`, `receitasProv`, `despesasReal`, `despesasProv`) usando opacidade reduzida para as provisionadas.
- `src/hooks/useDreReport.ts`: estender `DreFilters` com `onlyRealized?: boolean`. Quando ligado e regime = `competencia`, aplicar `.in('status', ['pago','recebido'])` na `fetchPeriodValues` igual ao já feito em caixa.
- `src/components/reports/DreReport.tsx`: novo `Switch` "Somente realizado" visível apenas quando `regime === 'competencia'`.
- Não há mudança de schema, RLS ou migrações.

## Fora de escopo

- Não vamos mexer em saldo inicial / ajuste manual de caixa (estão corretos como aporte e já entram no Saldo Total).
- Não vamos refatorar o cálculo do DRE em Caixa.
- Sem alterações em rateio, anexos, comissões.
- Não alterar informações já lançadas ou em processo de lançamento, mas apenas convergir as somas e diferenças para auferir os resultados corretos e corrigir as divergências.

&nbsp;

# Em caso de Dúvidas  


- Faça perguntas chave para mim ou valide.