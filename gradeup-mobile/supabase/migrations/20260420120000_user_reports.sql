-- User reports table (App Store Guideline 1.2 UGC safety).
-- Any authenticated user can file a report against another user; only the reporter
-- can read their own reports. Admins (service role) read all via API/dashboard.

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 80),
  details text check (details is null or char_length(details) <= 2000),
  context text,            -- e.g. 'friend_profile', 'reaction', 'shared_task'
  context_ref text,        -- optional reference id
  status text not null default 'pending' check (status in ('pending','reviewed','actioned','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint user_reports_not_self check (reporter_id <> reported_user_id)
);

create index if not exists user_reports_reported_user_idx on public.user_reports(reported_user_id);
create index if not exists user_reports_reporter_idx on public.user_reports(reporter_id);
create index if not exists user_reports_status_idx on public.user_reports(status);

alter table public.user_reports enable row level security;

-- Reporters can insert reports for themselves.
drop policy if exists "user_reports insert self" on public.user_reports;
create policy "user_reports insert self"
  on public.user_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Reporters can read their own reports (for "My reports" views).
drop policy if exists "user_reports select own" on public.user_reports;
create policy "user_reports select own"
  on public.user_reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

-- No updates/deletes from clients; moderation happens via service role.
