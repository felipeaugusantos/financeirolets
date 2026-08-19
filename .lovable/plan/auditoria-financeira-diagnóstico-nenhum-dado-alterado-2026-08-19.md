# Auditoria financeira — diagnóstico (nenhum dado alterado)

Base: 1.748 lançamentos, mai–ago/2026. Toda a apuração abaixo foi feita com consultas independentes ao banco, sem usar os hooks do sistema. Nenhum UPDATE/DELETE/migration foi executado.

## Conferência independente (competência, exclui cancelados)

```text
Mês       Receitas      Despesas      Resultado
2026-05   206.017,88    181.618,84     24.399,04
2026-06   254.792,21    254.434,63        357,58
2026-07   218.671,17    184.402,86     34.268,31
2026-08    15.000,00          0,00     15.000,00  (base tem só 1 lançamento em agosto)
```

O Fluxo de Caixa por `payment_date` fecha com os mesmos valores (22.412,25 / 3.727,70 / 34.237,92 / 15.000,00) porque quase todos os lançamentos têm `competence_date = payment_date` (só 4 registros divergem em toda a base). Consequência: hoje Caixa e Competência dão praticamente o mesmo número — isso mascara qualquer bug de regime.

## ERRO CONFIRMADO

1. **CRÍTICO — Dashboard ignora rateio no "Saldo total / Movimentação" e nos alertas.**
   `src/hooks/useDashboard.ts` (bloco do saldo, ~linha 342, e o de vencimentos, ~linha 372) filtra com `.eq('unit_id', unitFilter)` / `.eq('front_id', frontFilter)`, enquanto os KPIs do período usam `filteredValue()` com `splitByUnit`. Com filtro de unidade, os 48 lançamentos rateados somem do saldo e dos alertas, mas aparecem nos KPIs — a mesma tela fica internamente incoerente. Correção: usar `splitByUnit`/`valueForUnitFilter` também nesses dois blocos.

2. **ALTO — DRE consolidado ≠ Consolidado do DRE Comparativo em R$ 323,30.**
   `useDreReport.computeLineValues` soma `net_amount` cheio quando não há filtro de unidade; o Comparativo soma os splits. Quando o rateio não fecha, os dois divergem. Casos: `7cdf619b… Caixa Inicial` (99,99% → −3,43) e `5b59ca59… PAGTO ELETRON COBRANCA SALGADO` (rateio 0% → −319,87). Correção: normalizar o resíduo do rateio para "Sem unidade" numa única função em `src/lib/finance.ts`, usada pelas duas telas.

3. **MÉDIO — Filtro de frente de negócio usa `Math.min(valorUnidade, valorFrente)`.**
   Em `useDashboard.filteredValue`, combinar unidade + frente pega o menor dos dois em vez da interseção real do rateio. Com rateios cruzados unidade×frente o número fica arbitrário (hoje subestima). Nenhum caso ativo na base, mas a fórmula está errada.

## INCONSISTÊNCIA DE DADOS

- **Rateios que não fecham (2 casos, R$ 323,30):** ver item 2 acima. Os outros 46 fecham exatos; nenhum rateio duplicado por unidade; nenhum percentual/valor nulo. Todos os 48 rateados também têm `unit_id` preenchido (conflito potencial de leitura, hoje sem efeito porque o rateio tem precedência).
- **Categorias sem linha de DRE — R$ 112.675,36 fora do DRE:** `Sem ID` (10 lançamentos, R$ 104.873,36), `Empréstimo Ifood` (R$ 7.442,00), `ANA (BTB)` (R$ 360,00). Esses valores existem no caixa e desaparecem do DRE silenciosamente (`computeLineValues` faz `if (!dreLineId) return`). Maior distorção da base.
- **Transferências tratadas de dois jeitos:** 20 lançamentos com `affects_dre=false` (R$ 17.192,07) e 20 com `affects_dre=true` (R$ 88.725,04). Além disso Entradas (R$ 53.076,79) ≠ Saídas (R$ 52.840,32) → R$ 236,47 sem par.
- **Tipo × status incoerente: 29 registros** (17 receitas "pago" R$ 35.639,57; 12 despesas "recebido" R$ 17.154,65). Não afeta soma (o código usa `type`), mas quebra qualquer filtro por status.
- **7 lançamentos pagos/recebidos sem `payment_date`** — somem do Fluxo de Caixa realizado (R$ 989,68).
- **Categoria `Salários` (61 usos) aponta para a linha "Salários Fábrica", mas 41 usos são de loja** (Let's Café 31, Boulevard 10). Infla Fábrica na análise por linha.
- **`Matéria-Prima`: 98 de 137 lançamentos sem unidade**; `Mensal Motoqueiro` todos em loja (nenhum na Fábrica).
- **181 lançamentos sem unidade e sem rateio (R$ 127.467,32)**; 175 sem conta; 17 sem categoria.
- **Duplicidades (critério ampliado com conta, categoria e minuto de criação):** 27 grupos, 37 registros excedentes, R$ 17.215,32 potenciais. Alta confiança: 8 grupos. Média: 7. Baixa: 12 (ex.: "detetização" mai×jun são meses diferentes → legítimo).
- **Unidades espúrias:** "Distribuição" (1 lançamento) e "Eai Brownie Boulevard" (1) parecem cadastro de teste.

## RISCO FUTURO

- Todos os relatórios usam `.limit(10000)` (DRE, Dashboard, Fluxo, Comparativo, Reconciliação, Conferência). Com 1.748 registros não há truncamento, mas só o DRE e o Dashboard emitem `console.warn`; os demais truncariam em silêncio. Sem paginação em nenhum deles.
- `useDashboard` alertas: `.limit(100)` fixo — a partir de 100 contas vencidas o card passa a mentir.
- Como `competence_date ≈ payment_date` em 99,8% da base, um bug de regime hoje seria invisível.
- `initial_balance` = 0 em todas as contas: impossível comparar saldo com extrato bancário absoluto. Só variação é auditável.

## COMPORTAMENTO CORRETO (não é bug)

- Árvore do DRE validada: 162 linhas ativas, nenhuma folha órfã, nenhum sinal invertido (nenhuma folha positiva dentro de grupo de despesa nem o contrário). Os 3 subtotais sem filhos (códigos 3, 5 e 8) são calculados pelas fórmulas explícitas em `buildSubtotals` — corretos, sem dupla contagem e sem duplo sinal.
- Cancelados: 0 registros na base; a regra de exclusão está aplicada em todas as telas.
- `affects_dre=false` fora do DRE e `affects_cashflow=false` fora do caixa: coerente com `src/lib/finance.ts`.
- Caixa ≠ Competência é esperado; hoje coincidem só por causa dos dados.
- Nenhum `net_amount` nulo ou negativo; nenhum valor sendo somado duas vezes na apuração de meses.

## Respostas diretas

- **Erro de cálculo no código?** Sim — 3 (itens 1 a 3 acima).
- **Lançamento contado duas vezes?** Não pelo código. No dado, sim: 37 registros excedentes de duplicidade.
- **Lançamento desaparecendo?** Sim: R$ 112.675,36 em categorias sem linha de DRE, 7 pagos sem `payment_date` fora do caixa, e os rateados somem do saldo do Dashboard quando há filtro de unidade.
- **DRE × DRE Comparativo batem?** Quase: divergem em R$ 323,30 (2 rateios quebrados).
- **Dashboard respeita rateio?** Nos KPIs do período sim; no saldo/movimentação e alertas não.
- **Fluxo de Caixa fecha mês a mês?** Sim; o acumulado é consistente (22.412,25 → 26.139,95 → 60.377,87 → 75.377,87).
- **Maior bloqueio para confiar 100%:** as categorias sem linha de DRE (R$ 112k) somadas ao `initial_balance` zerado.

## Ordem de correção recomendada (próxima etapa, com sua aprovação)

1. Mapear `Sem ID`, `Empréstimo Ifood` e `ANA (BTB)` para linhas de DRE — e fazer o DRE exibir um bloco "fora do DRE" em vez de descartar em silêncio (código).
2. Corrigir o saldo/movimentação e os alertas do Dashboard para usar rateio (código).
3. Unificar o consolidado DRE × Comparativo com resíduo de rateio em "Sem unidade" (código).
4. Corrigir a fórmula unidade × frente (código).
5. Padronizar transferências (`affects_dre=false` para todas) — dado, via tela de Conferência.
6. Revisar manualmente os 15 grupos de duplicidade de alta/média confiança (dado).
7. Preencher `initial_balance` das contas (dado).
8. Acrescentar testes de invariante em `src/test/` para: consolidado = unidades + Sem unidade, rateio ≤ valor original, subtotal = soma dos filhos, acumulado do caixa, e nenhum lançamento descartado por falta de linha de DRE. Onde a regra falha hoje, o teste deve falhar — não será adaptado para passar.
