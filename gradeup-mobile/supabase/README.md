# Supabase — shared project, manual migrations

Project ref: `ujxrtuogdialsrzxkcey` (**shared** with the rencana web repo at
`~/Documents/rencana` — same database, two codebases writing migrations).

## ⚠️ Never run `supabase db push` here

The remote migration history is permanently out of sync with this folder:
dozens of applied migrations were run by hand and never recorded, and the
history also contains rencana-side versions this repo doesn't have. A
`db push` would try to re-apply ~150 already-applied migrations — most would
error on "already exists", and data-modifying ones could run twice.

The workflow that works:

1. Write the migration file here (next `2026MMDD0000NN_*.sql` version).
2. Paste and run it in the **SQL Editor of the correct project** — check the
   breadcrumb says the student-planner project, not another project, before
   running (we have accidentally run SQL on the wrong project before).
3. Record it so tooling knows it's applied:
   `npx supabase migration repair --status applied <version>`

## Cross-repo dependencies (apply order matters)

- `recompute_subscription_access(uuid)` — the single source of truth for a
  user's effective plan — is **defined by this repo's migrations**
  (`20260811000002`, updated by `20260822000002/6`), but rencana's Curlec
  webhook and billing endpoints **call** it. Changing its signature or
  dropping it breaks web payments.
- This repo's recompute reads `billing_subscriptions`, `billing_payments`,
  `billing_refunds` — tables **created by rencana's migrations**
  (`202605150001_billing_ledger.sql`). On a fresh database, rencana's billing
  ledger migration must be applied before `20260811000002` from here.
- Provider facts live in `subscription_entitlements` (this repo); Curlec facts
  live in the `billing_*` ledger (rencana). Neither side may write
  `profiles.subscription_plan` directly — always go through the recompute.

## Scheduled jobs (pg_cron)

- `subscription-expiry-sweep` — daily 20:00 UTC, demotes lapsed plans
  (`20260822000004`).
- `ops-events-retention` — daily 20:30 UTC, prunes `ops_events` to 90 days
  (`20260822000005`).

## Failure monitoring

Edge functions log failures to `public.ops_events` via
`functions/_shared/opsLog.ts` (codes + sanitized messages only — never note
contents, tokens, or user messages). Daily rates: `ops_daily_failures` view.
