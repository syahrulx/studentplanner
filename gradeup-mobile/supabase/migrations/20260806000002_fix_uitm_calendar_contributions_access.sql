-- Fix: same "policy defined in a migration but never took effect on
-- production" pattern confirmed for support_report_messages
-- (20260806000001_fix_support_report_messages_access.sql), found by a
-- follow-up static audit for the same table/migration shape: a brand-new
-- table whose RLS policies mix an is_admin() "for all" policy with
-- user-facing read/insert policies, accessed directly by the client with no
-- SECURITY DEFINER RPC fallback.
--
-- Symptom (if this table hit the same drift): a UiTM student submits a
-- community calendar contribution successfully-looking (or not), but
-- fetchApprovedUitmCalendarContributions() in
-- src/lib/uitmCalendarContributionsDb.ts silently swallows any read error
-- and returns [] — indistinguishable from "no one has submitted one yet".
--
-- Fully idempotent — safe to run regardless of current state, touches no
-- existing data.

grant select, insert on public.uitm_calendar_contributions to authenticated;

alter table public.uitm_calendar_contributions enable row level security;

drop policy if exists uitm_calendar_contributions_read_own_or_approved on public.uitm_calendar_contributions;
create policy uitm_calendar_contributions_read_own_or_approved
  on public.uitm_calendar_contributions
  for select to authenticated
  using (created_by = auth.uid() or status = 'approved');

drop policy if exists uitm_calendar_contributions_insert_own_pending on public.uitm_calendar_contributions;
create policy uitm_calendar_contributions_insert_own_pending
  on public.uitm_calendar_contributions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists uitm_calendar_contributions_admin_all on public.uitm_calendar_contributions;
create policy uitm_calendar_contributions_admin_all
  on public.uitm_calendar_contributions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
