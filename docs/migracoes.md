# Migrações e scripts SQL

Estado em 12/11/2026. O SQL chega ao banco por **três canais**; nenhum deles reproduz sozinho o schema inteiro.

| Canal | O que é | Como chega ao banco |
|---|---|---|
| `supabase/migrations/` (40 arquivos) | Histórico principal. Até `20260924…` gerado pelo Lovable; de `20261002…` em diante escrito à mão (RPCs atômicas, dashboard, iFood, Bradesco, cota do Kaikin). | Aplicado pelo Lovable Cloud |
| `drizzle/migrations/` (0000–0009) | CRM, fábrica e repasses do iFood. `drizzle/legacy-migrations/` guarda o histórico antigo sem alteração (reaplicar blocos já aplicados bloqueia migrações aditivas; ver `AGENTS.md`). | `drizzle-kit` (`drizzle.config.ts`) |
| `scripts/producao/` | Entrega manual para o SQL Editor do Supabase, em partes pequenas (o editor falha com função grande). Idempotente. | Colado à mão em produção |

## Relação entre os canais

- **Cópias idênticas** (mesmo SQL, só muda o nome): `07`, `08`, `09`, `10`, `13`, `15` e `16` de `scripts/producao` espelham uma migração de `supabase/migrations`. `src/test/migrationsDrift.test.ts` falha se divergirem.
- **Não são cópias, por desenho:**
  - `04-permissoes-conciliacao.sql` é um superconjunto (inclui as políticas de escrita de `20260920203519…` além da migração `20261002120000…`).
  - `11-dashboard/11a`–`11g` dividem a migração `20261008120000…` em partes (já coberto por `dashboardSummarySql.test.ts`).
  - `14-crm-fabrica/14a`–`14f` consolidam o estado final das migrações drizzle (já coberto por `crmFabricaSql.test.ts`).

## Verificação automática

- **CI `migrations-replay`**: aplica `supabase/migrations` em ordem num Postgres vazio com o stub do Supabase (`scripts/testes-sql/replay-migrations.sh`). Hoje as 40 passam. Rodar local: ver `scripts/testes-sql/README.md`.
- **`migrationsDrift.test.ts`**: cópias idênticas, nomes/prefixos únicos e `_journal.json` do drizzle coerente com os arquivos.

## Lacuna conhecida: o schema não se reconstrói só pelo repositório

Aplicando `supabase/migrations` e depois `drizzle/migrations` num banco vazio, três migrações drizzle falham:

- `0005_crm_order_items` e `0009_factory_batches`: `public.crm_products` não existe.
- `0007_ingredient_purchase_link`: `public.factory_ingredients` não existe.

`crm_products`, `factory_ingredients`, `factory_recipes`, `factory_recipe_items` e `factory_forecasts` só são criadas em `scripts/producao/14-crm-fabrica/14d-fabrica-base.sql` (manual) e não constam em `drizzle/schema.ts`. Ou seja, um clone novo (por exemplo, homologação) não sai do repositório sozinho.

## Caminho recomendado (precisa de decisão e de acesso ao banco)

Não movi nem apaguei nada: o que já foi aplicado em produção não deve ser reaplicado, e o `AGENTS.md` exige manter o histórico do drizzle.

1. Tirar um `pg_dump --schema-only` de produção e conferir o que existe de fato contra os três canais.
2. Declarar as tabelas faltantes (`crm_products`, `factory_*`) em `drizzle/schema.ts` e numa migração `IF NOT EXISTS` que rode **antes** de `0005`, sem alterar o que já existe em produção.
3. Definir uma ordem única de aplicação (supabase → drizzle) e estendê-la ao job `migrations-replay`.
4. Só então aposentar `scripts/producao`, mantendo-o como cópia gerada se o SQL Editor continuar sendo usado.
