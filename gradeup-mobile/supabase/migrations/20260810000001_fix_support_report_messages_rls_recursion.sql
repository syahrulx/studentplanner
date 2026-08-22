-- Fix (attempt 2): users still cannot read or send replies in their own
-- support ticket thread, even after 20260806000001 was run.
--
-- Root cause: the support_report_messages policies check ownership with
-- `exists (select 1 from support_reports r where r.id = report_id and
-- r.reporter_id = auth.uid())`. That subquery runs under the CALLING USER's
-- own RLS on support_reports — and 202608030002 deliberately dropped the
-- user's own "select own" policy on support_reports (replacing it with the
-- SECURITY DEFINER get_my_support_report() RPC, so admin_notes stays
-- hidden). So for a regular user, support_reports looks completely empty to
-- that subquery: exists(...) is always false, and both the read and reply
-- policies on support_report_messages silently reject every regular user,
-- regardless of whether report_id/reporter_id actually match. Re-running
-- 20260806000001 could never fix this — it re-creates the exact same
-- subquery.
--
-- Fix: check ownership through a SECURITY DEFINER helper (bypasses RLS on
-- support_reports, same pattern as get_my_support_report()) instead of an
-- inline subquery. Idempotent — safe to re-run, touches no existing rows.

create or replace function public.owns_support_report(p_report_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.support_reports r
    where r.id = p_report_id and r.reporter_id = auth.uid()
  );
$$;

revoke all on function public.owns_support_report(uuid) from public;
grant execute on function public.owns_support_report(uuid) to authenticated;

drop policy if exists "support message reporter read own" on public.support_report_messages;
create policy "support message reporter read own"
  on public.support_report_messages for select to authenticated
  using (public.owns_support_report(report_id));

drop policy if exists "support message reporter reply own" on public.support_report_messages;
create policy "support message reporter reply own"
  on public.support_report_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and author_role = 'user'
    and public.owns_support_report(report_id)
  );
