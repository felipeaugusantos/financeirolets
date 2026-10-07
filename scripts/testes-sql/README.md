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
