#!/usr/bin/env bash
# Aplica supabase/migrations, em ordem, num Postgres vazio com o stub do Supabase.
# Falha na primeira migração que der erro. Uso: replay-migrations.sh [psql args], ex.: -h localhost -U postgres
# O banco alvo vem de PGDATABASE (padrão: replay) e é recriado a cada execução.
set -euo pipefail
cd "$(dirname "$0")/../.."
db="${PGDATABASE:-replay}"
psql "$@" -d postgres -qc "drop database if exists \"$db\"" -c "create database \"$db\""
psql "$@" -d "$db" -q -v ON_ERROR_STOP=1 -f scripts/testes-sql/stubs-supabase.sql
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "aplicando $f"
  psql "$@" -d "$db" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
echo "OK: $(ls supabase/migrations/*.sql | wc -l) migrações aplicadas em banco vazio"
