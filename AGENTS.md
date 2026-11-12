# AGENTS

- Managed Cloud migrations use `drizzle/migrations`; the original history is retained unchanged in `drizzle/legacy-migrations` because replaying already-applied financial schema blocks additive migrations.
- CRM screens reuse `useSupabaseCrud` and existing CRUD controls; records are archived rather than deleted to preserve commercial history and remain isolated from financial postings.
- CRM discovery runs in authenticated Cloud functions, with bounded Google Places requests and single CNPJ lookups; imports use company CRUD and portfolio-scoped external identifiers to prevent duplicates without financial postings.

- CRM commercial domain rules live in `src/lib/crmRules.ts` independently of financial calculations — estimates must never post revenue or alter DRE totals.

- DRE totals (DreReport, DreGerencial, DreComparativo) must go through `src/lib/dreTotals.ts` (formula > children > legacy > value×sign) — one engine keeps all reports consistent and configurable via dre_lines.formula.
- Accounting category views reuse the existing Transactions list and form with a fixed category scope resolved from live categories — this preserves allocation, authorization, and save behavior without duplicate financial workflows.
- iFood data is read-only except an explicit per-store weekly payout posting (gross revenue + iFood fee expenses, all pending) recorded in ifood_payout_postings; bank reconciliation settles the receivable and its linked expenses together via src/lib/ofxSettle.ts (statement import auto-links only unique iFood credit = posting net matches via src/lib/ifoodAutoMatch.ts), and reopens only what it settled — prevents double-counting revenue already arriving via statements.
- Helpdesk tickets go through the authenticated `helpdesk-ticket` Cloud function (token stays server-side); automatic failure tickets use `reportFailureTicket` in src/lib/helpdesk.ts, deduplicated to one per error per day and never interrupting the flow.
- Helpdesk image attachments for tickets and replies reuse the private attachments bucket with expiring signed links in the message — support can view images without making financial attachments public.
- Single-entry OFX creation uses OfxAllocationEditor for explicit manual splits and preserves rule allocations when disabled — allocation options must not depend on selecting multiple entries.
- Validate public connection values for local/CI Vite configurations without hardcoded fallbacks; delegate the generated .lovable/preview-supabase.config.ts build to Cloud — its connection configuration is not exposed in configResolved env/define.
- Keep the Cloud-generated `.env` (public connection values only) tracked in git — production publish builds from the repository and fails the connection check without it; put secrets only in Cloud secrets.
