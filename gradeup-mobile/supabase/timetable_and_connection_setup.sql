-- =============================================================================
-- Timetable + university connection — run in Supabase SQL Editor
-- All rows are scoped to the logged-in user via RLS (auth.uid() = user_id).
-- Safe to run more than once (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

-- ── University connection (one row per user; no passwords stored) ───────────
create table if not exists public.university_connections (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  university_id     text not null,
  student_id        text not null default '',
  connected_at      timestamptz not null default now(),
  last_sync         timestamptz,
  terms_accepted_at timestamptz not null default now()
);

alter table public.university_connections enable row level security;

drop policy if exists "Users manage own university_connections" on public.university_connections;
create policy "Users manage own university_connections"
  on public.university_connections
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Timetable entries (subject slots per user) ──────────────────────────────
create table if not exists public.timetable_entries (
  id              text not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  day             text not null,
  subject_code    text not null default '',
  subject_name    text not null default '',
  lecturer        text not null default '',
  start_time      text not null,
  end_time        text not null,
  location        text not null default '',
  group_name      text,
  semester_label  text,
  display_name    text,
  slot_color      text,
  primary key (id, user_id)
);

-- Add customization columns if table already existed from an older migration
alter table public.timetable_entries
  add column if not exists display_name text;
alter table public.timetable_entries
  add column if not exists slot_color text;

alter table public.timetable_entries enable row level security;

drop policy if exists "Users manage own timetable_entries" on public.timetable_entries;
create policy "Users manage own timetable_entries"
  on public.timetable_entries
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Helpful indexes (queries always filter by user)
create index if not exists timetable_entries_user_id_idx
  on public.timetable_entries (user_id);
create index if not exists timetable_entries_user_day_idx
  on public.timetable_entries (user_id, day);

comment on table public.university_connections is
  'Linked university portal; visible only to the owning auth user.';
comment on table public.timetable_entries is
  'Imported/edited class schedule; visible only to the owning auth user.';

-- ── Profile: MyStudent fields (optional; same user row as auth) ────────────
alter table public.profiles
  add column if not exists student_id text,
  add column if not exists program text,
  add column if not exists part smallint;
