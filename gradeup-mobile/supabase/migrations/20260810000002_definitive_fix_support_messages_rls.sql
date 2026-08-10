-- Definitive fix for support_report_messages RLS.
--
-- Problem: users get "new row violates row-level security policy" when replying
-- to their own support ticket. Two separate issues compound:
--
--   1. Table-level GRANT may be missing (table was created outside the normal
--      Supabase flow, so `authenticated` may lack INSERT/SELECT privileges).
--
--   2. The INSERT policy's ownership check does an inline subquery against
--      support_reports, but the user's SELECT policy on support_reports was
--      deliberately dropped (to hide admin_notes via a SECURITY DEFINER RPC).
--      So the subquery always returns empty → policy rejects the insert.
--
-- Fix: ensure table grants exist + use a SECURITY DEFINER helper to check
-- report ownership (bypasses RLS on support_reports). Fully idempotent.

-- 1. Table-level grants
grant select, insert on public.support_report_messages to authenticated;

-- 2. Ownership helper (SECURITY DEFINER bypasses RLS on support_reports)
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

-- 3. SELECT policy — user can read messages on their own ticket
drop policy if exists "support message reporter read own" on public.support_report_messages;
create policy "support message reporter read own"
  on public.support_report_messages for select to authenticated
  using (public.owns_support_report(report_id));

-- 4. INSERT policy — user can reply to their own ticket
drop policy if exists "support message reporter reply own" on public.support_report_messages;
create policy "support message reporter reply own"
  on public.support_report_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and author_role = 'user'
    and public.owns_support_report(report_id)
  );

-- 5. Admin policy (unchanged, but re-assert for idempotency)
drop policy if exists "support message admins manage" on public.support_report_messages;
create policy "support message admins manage"
  on public.support_report_messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
