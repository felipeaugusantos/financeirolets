# AGENTS

- Managed Cloud migrations use `drizzle/migrations`; the original history is retained unchanged in `drizzle/legacy-migrations` because replaying already-applied financial schema blocks additive migrations.
- CRM screens reuse `useSupabaseCrud` and existing CRUD controls; records are archived rather than deleted to preserve commercial history and remain isolated from financial postings.

- CRM commercial domain rules live in `src/lib/crmRules.ts` independently of financial calculations — estimates must never post revenue or alter DRE totals.

- DRE totals (DreReport, DreGerencial, DreComparativo) must go through `src/lib/dreTotals.ts` (formula > children > legacy > value×sign) — one engine keeps all reports consistent and configurable via dre_lines.formula.
- Accounting category views reuse the existing Transactions list and form with a fixed category scope resolved from live categories — this preserves allocation, authorization, and save behavior without duplicate financial workflows.
