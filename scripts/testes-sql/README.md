# Testes das funções SQL num Postgres descartável

Esses testes não rodam no CI nem tocam o banco do Supabase: usam um Postgres local com as
migrações do repositório e um stub mínimo do Supabase (`auth.uid()`, papéis `anon`/`authenticated`).

```bash
# Postgres 16 local (exemplo; ajuste caminhos e porta)
initdb -D /tmp/pgtest/data -A trust && pg_ctl -D /tmp/pgtest/data -o '-p 5544 -k /tmp/pgtest' -w start
psql -h /tmp/pgtest -p 5544 -d postgres -c 'create database t'
psql -h /tmp/pgtest -p 5544 -d t -f scripts/testes-sql/stubs-supabase.sql
for f in $(ls supabase/migrations/*.sql | sort); do psql -h /tmp/pgtest -p 5544 -d t -q -f "$f"; done
psql -h /tmp/pgtest -p 5544 -d t -c 'grant all on all tables in schema public to authenticated, service_role'
psql -h /tmp/pgtest -p 5544 -d t -q -f scripts/testes-sql/09-salvar-e-excluir-lancamento.test.sql
```

Cada bloco imprime o que era esperado no título (`===== N) ... (esperado: ...)`) e o resultado
logo abaixo; erros `ERROR:` nos casos de falha são o comportamento esperado.

## Dashboard (SQL 11)

- Os scripts de produção do SQL 11 ficam em `scripts/producao/11-dashboard/` (partes 11a a 11g, rodar em ordem: o SQL Editor do
  Supabase falha com uma função grande, então cada parte é pequena). A migração é a soma delas.
- `11-dashboard-resumo.test.sql`: cenário conferido à mão (visão geral, filtro de unidade, provisionados, erros).
- `dashboard-paridade.ts`: **paridade com a lógica do app em dados aleatórios** (lançamentos, rateios, contas,
  filtros, períodos). Compara a função `dashboard_summary` com um oráculo em TypeScript que usa
  `src/lib/finance.ts`. Esperado: `0 divergência(s)`.

```bash
bun run scripts/testes-sql/dashboard-paridade.ts /tmp/pgtest 5544 t 25   # host do socket, porta, banco, rodadas
```

## iFood (SQL 13)

- `13-ifood-base.test.sql`: duas lojas, unicidade de `merchant_id` e do pedido por loja, exclusão em cascata e RLS
  (usuário sem papel não lê). Erros `ERROR:` nos casos marcados são o esperado.

## CRM, pedidos B2B, Fábrica e repasses do iFood (SQL 14)

- Scripts de produção em `scripts/producao/14-crm-fabrica/` (`14-00-diagnostico.sql` só lê; `14a` a `14f` são idempotentes).
- `14-crm-acesso.test.sql`: acesso por papel (vendedor, gerente, operador, admin, anônimo), trava de carteira,
  "não contatar", pedido único por oportunidade, previsão de fábrica única e permissões. Rodar depois dos scripts 14a-14f.
- Verificação feita: aplicar 14a-14f e as migrações `drizzle/migrations/0000-0009` em dois bancos limpos e comparar colunas,
  índices, políticas, gatilhos, restrições, permissões e funções (resultado idêntico).

## API de Saldo e Extrato do Bradesco (SQL 15)

- `scripts/producao/15-api-bradesco-saldos.sql` (idêntico à migração): `bank_balance_snapshots` (um saldo por conta, dia e origem) e
  `bank_api_sync_runs` (histórico das consultas), só para Admin/Financeiro.
- `15-api-bradesco-saldos.test.sql`: unicidade, validações, RLS por papel, anônimo e exclusão em cascata.
