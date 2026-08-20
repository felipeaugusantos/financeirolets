# Fechamento do DRE de julho/2026 — revisão caso a caso

Caixa, saldos e extratos ficam intocados. Nada é alterado sem você confirmar na tela Configurações → Conferência de lançamentos.

## Diagnóstico já levantado (somente leitura)

### PIX Martinho & Souza — 20 lançamentos, R$ 128.192,18

| Grupo | Qtd | Valor | Situação | Par encontrado | Sugestão / confiança |
|---|---|---|---|---|---|
| "MARTINHO SOUZA PRODUTOS" categorizados como Vendas Ifood | 11 | 118.275,66 | no DRE | não | iFood ou Venda — **decisão sua** (baixa confiança) |
| "MARTINHO & SOUZA PROD" categorizados como Transferência | 7 | 7.008,50 | fora do DRE | **sim**, saída idêntica no Boulevard no mesmo dia | Transferência (alta) |
| PIX de R$ 282,85 (15/07, Franqueadora) | 1 | 282,85 | **no DRE indevidamente** | **sim**, saída de 282,85 no Boulevard em 15/07 | Transferência (alta) |
| "MARTINHO SOUZA P E CO" R$ 900,00 (13/07, Franqueadora) | 1 | 900,00 | fora do DRE | não | verificar (média) |
| "MARTINHO SOUZA P E CO" R$ 1.460,00 (30/07, Café) | 1 | 1.460,00 | no DRE como Venda Loja | não | Venda (média) |

Os 7 pares confirmados são: 145,91 (01/07), 289,34 (02/07), 436,93 (04-06/07), 453,59 (06/07), 569,30 (13/07), 914,28 (10/07) e 4.947,15 (30/07) — cada um com saída de mesmo valor no Bradesco Boulevard. Já estão fora do DRE, então classificá-los como transferência não muda o resultado, apenas registra a decisão.

### Item 2 — os R$ 282,85

Lançamento `dd4e3a61`, 15/07, Bradesco Franqueadora, "PIX RECEBIDO REM: MARTINHO & SOUZA PROD 15/07", categoria Transferência entre Contas (Entrada), `affects_dre = true`. A contrapartida existe: `3a8e0c04`, saída de R$ 282,85 do Bradesco Boulevard no mesmo dia. É transferência interna com a flag errada. Tirar do DRE reduz a receita em R$ 282,85 e não toca no caixa.

### Item 3 — as duas transferências na linha 6.2 (R$ 416,86)

São exatamente o `dd4e3a61` acima (282,85) e o `01f89949` — 15/07, Franqueadora, "PIX RECEBIDO REM: LETS COOKIES 15/07", R$ 134,01, também categorizado como Transferência entre Contas (Entrada) com `affects_dre = true`. Para este segundo **não há contrapartida em julho** nas quatro contas: precisa da sua confirmação sobre a origem (outra conta do grupo, caixa ou venda). Fora do DRE, os dois somam −R$ 416,86 de receita.

### Item 4 — 13 grupos de possível duplicidade (R$ 2.380,75)

Ponto decisivo: o caixa fecha em R$ 0,00 conta a conta contra os extratos. Se houvesse lançamento a mais dentro de uma mesma conta, o saldo não fecharia. A classificação de confiança nasce disso:

- **Baixa confiança / provavelmente legítimos (11 grupos, ~R$ 12,00):** centavos de "RENTAB.INVEST FACILCRED" e tarifas de R$ 0,99 repetidas no mesmo dia — cada linha existe de fato no extrato.
- **Média confiança (2 grupos, R$ 2.374,29):** "PAGTO ELETRON COBRANCA NUTRI" R$ 506,29 em 15/07 (Franqueadora e Café — contas diferentes, provavelmente legítimo) e "PIX QR CODE DINAMICO" R$ 934,00 em 15/07 (três linhas: duas na Franqueadora e uma no Café — as duas da mesma conta merecem conferência no extrato).
- **Alta confiança:** nenhum grupo se enquadra hoje.

Também aparecem 3 lançamentos de rendimento categorizados como "Vendas Loja Física" (R$ 0,09 no total) — erro de categoria, não duplicidade.

### Item 5 — tipo × status

13 casos, R$ 6.484,54, sem efeito em DRE nem em caixa. Ficam num bloco separado, marcado como pendência operacional, para depois do fechamento.

## O que vou construir na tela de Conferência

1. **Painel de PIX com ficha completa por lançamento:** data, valor, conta, descrição, unidade, categoria, natureza atual, `affects_dre`, sugestão, motivo e **nível de confiança** (alta/média/baixa). Quando houver par, os dois lançamentos aparecem lado a lado com conta de origem e destino.
2. **Simulação antes de aplicar:** ao escolher uma natureza, o painel mostra Receita/Despesa/Resultado do DRE **Antes → Depois** e o valor exato que sai ou entra no resultado, sem gravar nada.
3. **Confirmação individual obrigatória:** cada aplicação passa pelo diálogo Antes vs Depois já existente e grava usuário, data e valores na Auditoria.
4. **Trava de caixa:** toda classificação mantém `affects_cashflow = true`. Depois de cada aplicação o sistema recalcula entradas, saídas e líquido de julho e, se sair de R$ 218.793,52 / R$ 184.402,86 / R$ 34.390,66, exibe alerta vermelho e bloqueia novas aplicações até revisão.
5. **Bloco de transferências indevidas no DRE:** lista os lançamentos de linha 6.x com `affects_dre = true`, com par quando existir e botão "Remover do resultado" (só muda a flag do DRE).
6. **Bloco de duplicidades reformulado:** grupos lado a lado com ID, data, valor, descrição, conta, unidade, categoria, horário de criação, origem e rateio; selo de confiança alta/média/baixa; ações Manter ambos, Marcar como legítimo, Cancelar um, Abrir lançamento e Corrigir por rateio. Excluir fica como última opção, atrás de confirmação explícita.
7. **Painel de resultado ao vivo:** cabeçalho fixo com Receita, Despesa e Resultado do DRE de julho, atualizado após cada confirmação, e um histórico da sessão no formato Antes → alteração → Depois.
8. **Botão "Revalidar julho":** roda de novo a auditoria completa (extratos, caixa, saldos por conta, DRE, DRE Comparativo, unidades, pendências) e mostra o resultado com as diferenças.

## Notas técnicas

- Reaproveita `src/lib/pixTriage.ts`, `src/hooks/usePixTriage.ts`, `src/components/quality/PixTriagePanel.tsx`, `useReviewActions` e `ConfirmChangeDialog`; a confiança e a ficha lado a lado entram em `pixTriage.ts`.
- Nenhuma correção em massa e nenhum script de banco: toda gravação sai de um clique confirmado na tela, passando pelo trigger `audit_transactions`.
- Classificar altera apenas `affects_dre`, categoria quando aplicável e a marcação `[natureza: x]` em `notes`. `payment_date`, `amount`, `account_id` e `affects_cashflow` não são tocados.

## Ao final

Com os casos revisados, rodo a auditoria independente e respondo em números: quantos PIX em cada natureza, valor que saiu do DRE, valor que permaneceu como receita, destino das duas transferências, quantas duplicidades eram reais, receita/despesa/resultado finais, DRE x DRE Comparativo, caixa e saldos — e se julho pode ser declarado 100% validado.
