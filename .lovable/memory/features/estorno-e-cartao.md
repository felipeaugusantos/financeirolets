---
name: Estorno e data de lançamento do cartão
description: Marcador is_reversal abate a mesma categoria no DRE; cartão usa launch_date (pagamento da fatura) como competência e pagamento.
type: feature
---
- `transactions.is_reversal`: estorno usa a MESMA categoria do original; `txValue` inverte o sinal (negativo no DRE, sentido contrário no caixa). DRE mostra "inclui estorno" na linha e selo "estorno" na lista de lançamentos.
- DRE: ícone de lista numa coluna após "Realizado" abre os lançamentos da linha (subtotais incluem filhos).
- Cartão: `card_statement_entries.launch_date` = data do pagamento da fatura (definida na importação, editável por linha). Lançamento criado usa essa data como competência, vencimento e pagamento; data da compra fica em posted_at e nas observações.
