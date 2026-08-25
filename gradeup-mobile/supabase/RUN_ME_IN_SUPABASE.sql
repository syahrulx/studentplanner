-- ═══════════════════════════════════════════════════════════════════════════
--  RENCANA — outstanding migrations, consolidated.
--  Run the WHOLE file at once in Supabase Dashboard → SQL Editor → Run.
--
--  SAFE TO RE-RUN. Every statement is idempotent. If you already ran some of
--  these, re-running changes nothing. No existing row is modified or deleted.
--
--  Contains 3 things:
--    PART 1 — country columns on profiles + universities   (overseas support)
--    PART 2 — seed 12 non-Malaysian universities            (US/UK/CA/AU)
--    PART 3 — fix support-ticket reply RLS                  (the "Could not
--             send / new row violates row-level security" bug)
--
--  PART 4 at the bottom prints a PASS/FAIL report. Read that output.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PART 1 — country field
--
-- ISO 3166-1 alpha-2 codes ('MY', 'US', 'GB', 'CA', 'AU'). Matches App Store
-- Connect / Play Console territory codes.
--
-- SAFE FOR YOUR ~9K USERS: `ADD COLUMN ... DEFAULT <constant>` is a
-- metadata-only operation in Postgres — no table rewrite, no row lock, no
-- backfill pass. Every existing profile and university gets 'MY' as part of
-- adding the column itself.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists country text not null default 'MY'
  check (country = upper(country) and char_length(country) = 2);

alter table public.universities
  add column if not exists country text not null default 'MY'
  check (country = upper(country) and char_length(country) = 2);

create index if not exists idx_profiles_country on public.profiles (country);
create index if not exists idx_universities_country on public.universities (country);

comment on column public.profiles.country is
  'ISO 3166-1 alpha-2 country code. Defaults to MY (Malaysia) for all existing users. User-editable in Settings.';
comment on column public.universities.country is
  'ISO 3166-1 alpha-2 country code the university belongs to. Defaults to MY for all pre-existing (Malaysian) rows.';


-- ───────────────────────────────────────────────────────────────────────────
-- PART 2 — seed overseas universities
--
-- Starter set only, so a non-Malaysian student has something to pick at
-- signup. Edit/add/remove freely afterwards in admin-web → Universities.
-- `on conflict do nothing` means this can never overwrite an existing row.
--
-- login_method is 'manual' for all of these: portal auto-sync exists only for
-- UiTM, so these students use the upload-a-PDF/image flow — same as every
-- non-UiTM Malaysian university today.
-- ───────────────────────────────────────────────────────────────────────────

insert into public.universities (id, name, country, login_method, request_method, required_params)
values
  ('asu',        'Arizona State University',        'US', 'manual', 'GET', '[]'::jsonb),
  ('osu',        'Ohio State University',           'US', 'manual', 'GET', '[]'::jsonb),
  ('ucf',        'University of Central Florida',   'US', 'manual', 'GET', '[]'::jsonb),
  ('manchester', 'University of Manchester',        'GB', 'manual', 'GET', '[]'::jsonb),
  ('leeds',      'University of Leeds',             'GB', 'manual', 'GET', '[]'::jsonb),
  ('coventry',   'Coventry University',             'GB', 'manual', 'GET', '[]'::jsonb),
  ('toronto',    'University of Toronto',           'CA', 'manual', 'GET', '[]'::jsonb),
  ('york_ca',    'York University',                 'CA', 'manual', 'GET', '[]'::jsonb),
  ('tmu',        'Toronto Metropolitan University', 'CA', 'manual', 'GET', '[]'::jsonb),
  ('melbourne',  'University of Melbourne',         'AU', 'manual', 'GET', '[]'::jsonb),
  ('monash',     'Monash University',               'AU', 'manual', 'GET', '[]'::jsonb),
  ('rmit',       'RMIT University',                 'AU', 'manual', 'GET', '[]'::jsonb)
on conflict (id) do nothing;


-- ───────────────────────────────────────────────────────────────────────────
-- PART 3 — support ticket reply RLS fix
--
-- Bug: user taps send on their own ticket → "new row violates row-level
-- security policy for table support_report_messages".
--
-- Cause: the INSERT policy checked ownership with an inline
-- `exists (select 1 from support_reports where ...)`. That subquery runs
-- under the CALLING USER's RLS on support_reports — and the user's own
-- "select own" policy on support_reports was deliberately dropped earlier
-- (so admin_notes stays hidden behind a SECURITY DEFINER RPC). Result: the
-- subquery sees zero rows, exists() is always false, and every reply is
-- rejected no matter how correct the data is.
--
-- Fix: check ownership via a SECURITY DEFINER helper, which bypasses RLS on
-- support_reports — same pattern as the existing get_my_support_report().
-- ───────────────────────────────────────────────────────────────────────────

-- Table-level grants, in case this table never picked up the project's
-- default `authenticated` privileges. RLS below still narrows access.
grant select, insert on public.support_report_messages to authenticated;

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

drop policy if exists "support message admins manage" on public.support_report_messages;
create policy "support message admins manage"
  on public.support_report_messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — VERIFICATION. Read this output. Everything should say PASS.
-- ═══════════════════════════════════════════════════════════════════════════

select
  '1. profiles.country exists' as check,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'country'
  ) then 'PASS' else 'FAIL' end as result

union all select
  '2. universities.country exists',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'universities' and column_name = 'country'
  ) then 'PASS' else 'FAIL' end

union all select
  '3. all existing profiles defaulted to MY',
  case when (select count(*) from public.profiles where country is distinct from 'MY') = 0
       then 'PASS - every existing user is MY'
       else 'INFO - ' || (select count(*) from public.profiles where country is distinct from 'MY')::text
            || ' profile(s) are non-MY (expected only if someone already changed it)' end

union all select
  '4. overseas universities seeded',
  case when (select count(*) from public.universities where country <> 'MY') >= 12
       then 'PASS - ' || (select count(*) from public.universities where country <> 'MY')::text || ' non-MY universities'
       else 'FAIL - only ' || (select count(*) from public.universities where country <> 'MY')::text end

union all select
  '5. owns_support_report() is SECURITY DEFINER',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'owns_support_report' and p.prosecdef
  ) then 'PASS' else 'FAIL' end

union all select
  '6. support reply policy uses the helper (not the broken subquery)',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'support_report_messages'
      and cmd = 'INSERT'
      and with_check like '%owns_support_report%'
  ) then 'PASS' else 'FAIL - still using the old inline EXISTS subquery' end

union all select
  '7. authenticated can INSERT support messages',
  case when exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'support_report_messages'
      and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) then 'PASS' else 'FAIL' end

order by 1;
