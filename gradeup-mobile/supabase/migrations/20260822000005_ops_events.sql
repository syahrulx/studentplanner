-- Central failure log for edge functions and backend jobs, so failure rates
-- (PDF extraction, AI generation, webhooks) are queryable instead of living
-- only in per-invocation console logs. Writers must record error CODES and
-- sanitized messages only — never note contents, tokens, or user messages.

create table if not exists public.ops_events (
  id bigint generated always as identity primary key,
  source text not null,
  event_type text not null default 'error' check (event_type in ('error', 'failure', 'warning')),
  code text,
  message text,
  user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.ops_events enable row level security;
revoke all on public.ops_events from anon, authenticated;

create index if not exists ops_events_source_created_idx
  on public.ops_events (source, created_at desc);
create index if not exists ops_events_created_idx
  on public.ops_events (created_at desc);

-- Daily failure counts per source/code. Service-role only, like the table.
create or replace view public.ops_daily_failures
with (security_invoker = true) as
select
  date_trunc('day', created_at) as day,
  source,
  code,
  count(*) as failures
from public.ops_events
group by 1, 2, 3
order by 1 desc, 4 desc;

revoke all on public.ops_daily_failures from anon, authenticated;

-- Keep 90 days; pg_cron is already enabled by 20260822000004.
select cron.schedule(
  'ops-events-retention',
  '30 20 * * *',
  $$delete from public.ops_events where created_at < now() - interval '90 days';$$
);
