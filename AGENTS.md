# AGENTS

- CRM commercial domain rules live in `src/lib/crmRules.ts` independently of financial calculations — estimates must never post revenue or alter DRE totals.

- DRE totals (DreReport, DreGerencial, DreComparativo) must go through `src/lib/dreTotals.ts` (formula > children > legacy > value×sign) — one engine keeps all reports consistent and configurable via dre_lines.formula.
- Accounting category views reuse the existing Transactions list and form with a fixed category scope resolved from live categories — this preserves allocation, authorization, and save behavior without duplicate financial workflows.
