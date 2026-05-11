-- =============================================================================
-- support_reports — single inbox for bug reports, app complaints, FAQ questions
-- and complaints about another user, submitted from the mobile Settings screen
-- ("Report a Problem"). Managed from the admin web App Config -> User Reports.
--
-- Distinct from the existing `public.user_reports` table (20260420120000), which
-- is specifically the App Store Guideline 1.2 UGC user-vs-user moderation
-- inbox. Naming this `support_reports` so the two purposes stay isolated.
--
-- Reporters are auth.users; we snapshot their display name + email at report
-- time so admins still have something readable if the user later changes their
-- profile or is deleted.
-- =============================================================================

create table if not exists public.support_reports (
  id                       uuid primary key default gen_random_uuid(),
  reporter_id              uuid not null references auth.users(id) on delete set null,
  reporter_name_snapshot   text,                                                  -- display name at report time
  reporter_email_snapshot  text,                                                  -- email at report time
  kind                     text not null check (kind in (
                              'bug',
                              'issue',
                              'faq',
                              'app_complaint',
                              'user_complaint',
                              'other'
                            )),
  subject                  text not null check (char_length(subject) between 1 and 200),
  message                  text not null check (char_length(message) between 1 and 4000),
  target_user_handle       text,                                                  -- free-text @handle / email when reporting another user
  target_user_id           uuid references auth.users(id) on delete set null,    -- optional resolved link
  app_version              text,
  platform                 text check (platform in ('ios', 'android', 'web', 'other') or platform is null),
  status                   text not null default 'open' check (status in (
                              'open',
                              'in_progress',
                              'resolved',
                              'dismissed'
                            )),
  admin_notes              text,
  created_at               timestamptz not null default now(),
  resolved_at              timestamptz
);

alter table public.support_reports enable row level security;

-- Users may insert their own report rows; reporter_id is forced to auth.uid().
drop policy if exists "support_reports_insert_own" on public.support_reports;
create policy "support_reports_insert_own"
  on public.support_reports
  for insert
  with check (auth.uid() = reporter_id);

-- Users may read their own reports back (e.g. to show submission history).
drop policy if exists "support_reports_select_own" on public.support_reports;
create policy "support_reports_select_own"
  on public.support_reports
  for select
  using (auth.uid() = reporter_id);

-- Admin reads/writes go through the service-role edge function `admin_data`
-- (actions: list_support_reports, update_support_report_status), which
-- bypasses RLS. The admin web also calls supabase.from('support_reports')
-- directly when the admin user has a JWT session, so we ALSO grant the
-- standard admin policy below — same pattern as `service_reports`
-- (see 20260502120000_service_reports_admin_rls.sql).
drop policy if exists "support_reports admin select all" on public.support_reports;
create policy "support_reports admin select all"
  on public.support_reports
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "support_reports admin update all" on public.support_reports;
create policy "support_reports admin update all"
  on public.support_reports
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "support_reports admin delete all" on public.support_reports;
create policy "support_reports admin delete all"
  on public.support_reports
  for delete
  to authenticated
  using (public.is_admin());

create index if not exists idx_support_reports_created_at  on public.support_reports (created_at desc);
create index if not exists idx_support_reports_status      on public.support_reports (status);
create index if not exists idx_support_reports_kind        on public.support_reports (kind);
create index if not exists idx_support_reports_reporter_id on public.support_reports (reporter_id);

comment on table  public.support_reports is
  'User-submitted support requests: bug reports, complaints, FAQ questions and user-vs-user complaints from the mobile Settings -> Report a Problem screen. Separate from public.user_reports (App Store UGC moderation).';
comment on column public.support_reports.kind is
  'bug | issue | faq | app_complaint | user_complaint | other';
comment on column public.support_reports.status is
  'open | in_progress | resolved | dismissed (default open).';
