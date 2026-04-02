-- Admin Dashboard schema (Supabase)
-- This adds admin-only tables + RLS policies used by admin-web.

create extension if not exists pgcrypto;

-- Admins table (who can access admin dashboard)
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('super_admin', 'staff')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.admin_users enable row level security;

-- Helper: is admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
      and a.disabled = false
  );
$$;

-- Only admins can read their own admin row (and super_admin can read all)
create policy \"admin_users_read_self\"
on public.admin_users for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid() and a.role = 'super_admin' and a.disabled = false
  )
);

-- No direct client writes; use Edge Functions with service role for changes.
create policy \"admin_users_no_write\"
on public.admin_users for all
to authenticated
using (false)
with check (false);

-- Extend existing profiles with admin status fields (safe to re-run)
alter table public.profiles
  add column if not exists status text not null default 'active' check (status in ('active','disabled','banned')),
  add column if not exists created_at timestamptz not null default now();

-- Universities (admin managed)
create table if not exists public.universities (
  id text primary key,
  name text not null,
  api_endpoint text,
  login_method text not null default 'manual' check (login_method in ('manual','api')),
  request_method text not null default 'GET' check (request_method in ('GET','POST')),
  required_params jsonb not null default '[]'::jsonb,
  response_sample jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.universities enable row level security;

create policy \"universities_admin_read\"
on public.universities for select
to authenticated
using (public.is_admin());

create policy \"universities_admin_write\"
on public.universities for insert
to authenticated
with check (public.is_admin());

create policy \"universities_admin_update\"
on public.universities for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy \"universities_admin_delete\"
on public.universities for delete
to authenticated
using (public.is_admin());

-- Mapping config per university
create table if not exists public.university_mappings (
  university_id text primary key references public.universities(id) on delete cascade,
  timetable_mapping jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.university_mappings enable row level security;

create policy \"mappings_admin_read\"
on public.university_mappings for select
to authenticated
using (public.is_admin());

create policy \"mappings_admin_write\"
on public.university_mappings for insert
to authenticated
with check (public.is_admin());

create policy \"mappings_admin_update\"
on public.university_mappings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy \"mappings_admin_delete\"
on public.university_mappings for delete
to authenticated
using (public.is_admin());

-- Logs
create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('api_request','failed_login','error')),
  status text not null check (status in ('success','failed')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_logs enable row level security;

create policy \"logs_admin_read\"
on public.admin_logs for select
to authenticated
using (public.is_admin());

create policy \"logs_admin_insert\"
on public.admin_logs for insert
to authenticated
with check (public.is_admin());

-- Settings (single row per key)
create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;

create policy \"settings_admin_read\"
on public.admin_settings for select
to authenticated
using (public.is_admin());

create policy \"settings_admin_write\"
on public.admin_settings for insert
to authenticated
with check (public.is_admin());

create policy \"settings_admin_update\"
on public.admin_settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy \"settings_admin_delete\"
on public.admin_settings for delete
to authenticated
using (public.is_admin());

-- Courses (optional, for dashboard + future admin course management)
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  university_id text references public.universities(id) on delete set null,
  code text,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.courses enable row level security;

create policy \"courses_admin_read\"
on public.courses for select
to authenticated
using (public.is_admin());

create policy \"courses_admin_write\"
on public.courses for insert
to authenticated
with check (public.is_admin());

create policy \"courses_admin_update\"
on public.courses for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy \"courses_admin_delete\"
on public.courses for delete
to authenticated
using (public.is_admin());

-- Dashboard stats RPC (simple, extend later)
create or replace function public.admin_dashboard_overview()
returns jsonb
language plpgsql
security definer
as $$
declare
  out jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  out := jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'total_universities', (select count(*) from public.universities),
    'total_courses', (select count(*) from public.courses),
    'total_timetables', (select count(*) from public.timetable_entries)
  );
  return out;
end;
$$;

