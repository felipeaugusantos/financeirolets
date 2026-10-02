# Auditoria de RLS (02/10/2026)

Fonte: `supabase/migrations/*.sql` (estado acumulado; confirmar no banco com `select * from pg_policies`).

## Já restrito por papel (ok)
`transactions`, `transaction_allocations`, `attachments`, `budgets`, `partners`, `audit_logs`,
`closed_periods`, `category_split_rules` (escrita Admin/Financeiro) e leitura de lançamentos/rateios por dono/papel.
Escrita de `bank_statement_entries`, `card_statement_entries` e `ofx_import_rules` já restrita
(migration `20260920203519`).

## Leitura aberta a qualquer autenticado (`USING (true)`) — intencional
`units`, `business_fronts`, `accounts`, `categories`, `dre_lines`, `report_templates`,
`category_split_rules`: dados de referência. Aceitável; `accounts` pode expor dados bancários — avaliar.

## Lacunas tratadas em `20261002120000_restrict_reconciliation_reads.sql`
| Tabela | Antes | Depois |
|---|---|---|
| `bank_statement_entries` (SELECT) | qualquer autenticado | Admin/Financeiro |
| `card_statement_entries` (SELECT) | qualquer autenticado | Admin/Financeiro |
| `ofx_import_rules` (SELECT) | qualquer autenticado | Admin/Financeiro |
| `transaction_reviews` (INSERT/UPDATE) | qualquer autenticado | Admin/Financeiro |

**Antes de aplicar:** confirmar que Gerente/Operador não usam conciliação/conferência; testar em homologação.

## Pendente
- Verificar o storage bucket `attachments` (existe policy "Anyone can read attachments" em migration antiga; checar se foi substituída).
- Ampliar `rls.test.ts` com testes por papel (exige usuários de teste em homologação, não produção).
- `scripts/producao/*.sql` e `drizzle/` duplicam o schema; unificar em `supabase/migrations`.
