-- Which policies in PRODUCTION still evaluate a function per row?
--
-- Migration history is not the answer: a later ALTER POLICY can have fixed one,
-- and the 2026-09-23 fixes were applied by hand first. pg_policies is the truth.
-- Read-only; safe to run in the Supabase SQL editor.
--
-- A bare auth.uid() / is_admin() inside a policy runs once per row. On profiles
-- that read 24 million rows in 18 minutes. Wrapped as (select auth.uid()) it
-- becomes an InitPlan and runs once.
--
-- Exception, do not "fix" blindly: profiles' SELECT policies must stay
-- subquery-free, or every profiles UPDATE fails with 42P17 (infinite recursion).
-- See supabase/migrations/20260923000001_profiles_rls_hot_path.sql.

select
  schemaname,
  tablename,
  policyname,
  cmd,
  case
    when coalesce(qual, '') ~* '(?<!select )\mauth\.uid\(\)'       then 'USING'
    when coalesce(with_check, '') ~* '(?<!select )\mauth\.uid\(\)' then 'WITH CHECK'
  end as where_found,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and (
    coalesce(qual, '')       ~* '(?<!select )\m(auth\.uid|auth\.jwt|auth\.role|is_admin)\(\)'
    or coalesce(with_check, '') ~* '(?<!select )\m(auth\.uid|auth\.jwt|auth\.role|is_admin)\(\)'
  )
  and not (tablename = 'profiles' and cmd = 'SELECT')   -- recursion exemption
order by tablename, policyname;
