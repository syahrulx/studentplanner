-- =============================================================================
-- GradeUp — Full Database Setup (paste into Supabase SQL Editor and run once)
-- =============================================================================
-- Creates / updates everything the mobile app needs:
--   1. profiles          – extended columns for student detail
--   2. university_connections – which portal the user linked
--   3. timetable_entries – imported class schedule
--   4. academic_calendars – semester start/end + teaching weeks
--
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- All tables use RLS so each user can only see their own rows.
-- =============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  1. PROFILES — student detail written on connect / profile-settings     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- The base `profiles` table (id, name, university, updated_at) is usually
-- created by Supabase auth triggers.  We only ADD the extra columns the app
-- reads & writes.  If your project doesn't have `profiles` yet, uncomment
-- the block below:

-- UNCOMMENT if "profiles" table does NOT exist yet:
/*
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text,
  university  text,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile"
  on public.profiles for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);
*/

-- Extended profile columns (all IF NOT EXISTS — safe to re-run)
alter table public.profiles
  add column if not exists academic_level  text,       -- Diploma / Bachelor / Master / PhD / Foundation / Other
  add column if not exists student_id      text,       -- matric number (e.g. 2022123456)
  add column if not exists program         text,       -- primary programme (e.g. CS110 Diploma Sains Komputer)
  add column if not exists part            smallint,   -- semester part / year level
  add column if not exists avatar_url      text,       -- profile picture URL
  add column if not exists campus          text,       -- campus name (e.g. UiTM Kampus Sungai Petani)
  add column if not exists faculty         text,       -- faculty / college line
  add column if not exists study_mode      text,       -- Sepenuh Masa / Separuh Masa / etc.
  add column if not exists current_semester smallint,  -- current semester number from portal
  add column if not exists hea_term_code   text,       -- HEA term/semester code (e.g. 20262) to pick correct calendar segment
  add column if not exists mystudent_email text,       -- personal email from portal profile
  add column if not exists university_id   text,       -- linked portal key (e.g. 'uitm')
  add column if not exists last_sync       timestamptz,-- last successful portal sync time
  add column if not exists portal_teaching_anchored_semester smallint; -- semester we last anchored teaching week 1 to

comment on column public.profiles.academic_level  is 'Academic level: Diploma / Bachelor / Master / PhD / Foundation / Other';
comment on column public.profiles.student_id      is 'Matric / student number (e.g. from MyStudent connect)';
comment on column public.profiles.program         is 'Primary programme or faculty line (e.g. from portal)';
comment on column public.profiles.part            is 'Semester part / year level when applicable';
comment on column public.profiles.campus          is 'Campus name from portal profile';
comment on column public.profiles.faculty         is 'Faculty / college line from portal';
comment on column public.profiles.study_mode      is 'Mode of study (e.g. Sepenuh Masa)';
comment on column public.profiles.current_semester is 'Current semester number from portal';
comment on column public.profiles.hea_term_code   is 'UiTM HEA academic calendar term/semester code (e.g. 20262) used to select the correct calendar segment';
comment on column public.profiles.mystudent_email is 'Personal email shown on portal profile';
comment on column public.profiles.university_id   is 'Linked portal id (e.g. uitm); set when user saves imported timetable';
comment on column public.profiles.last_sync       is 'ISO timestamp of last successful portal timetable/profile sync';
comment on column public.profiles.portal_teaching_anchored_semester is 'Last current_semester value the academic calendar start was aligned to';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2. UNIVERSITY CONNECTIONS — one row per user (no passwords stored)     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
create table if not exists public.university_connections (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  university_id     text not null,            -- e.g. 'uitm'
  student_id        text not null default '', -- matric / login used
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

comment on table public.university_connections is
  'Linked university portal per user; visible only to the owning auth user.';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  3. TIMETABLE ENTRIES — class schedule rows per user                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
create table if not exists public.timetable_entries (
  id              text not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  day             text not null,              -- Monday / Tuesday / …
  subject_code    text not null default '',   -- e.g. CSC580
  subject_name    text not null default '',   -- e.g. Artificial Intelligence
  lecturer        text not null default '',
  start_time      text not null,              -- HH:MM (24h)
  end_time        text not null,              -- HH:MM (24h)
  location        text not null default '',
  group_name      text,                       -- tutorial/lab group
  semester_label  text,                       -- e.g. 'Semester March – July 2026'
  display_name    text,                       -- user-customised slot label
  slot_color      text,                       -- user-customised hex colour
  primary key (id, user_id)
);

-- In case table existed before the display columns were added
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

create index if not exists timetable_entries_user_id_idx
  on public.timetable_entries (user_id);
create index if not exists timetable_entries_user_day_idx
  on public.timetable_entries (user_id, day);

comment on table public.timetable_entries is
  'Imported/edited class schedule; visible only to the owning auth user.';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  4. ACADEMIC CALENDARS — semester start/end + teaching weeks            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
create table if not exists public.academic_calendars (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  semester_label  text,
  start_date      date not null,
  end_date        date not null,
  total_weeks     smallint not null default 14,
  break_start_date date,
  break_end_date   date,
  periods_json    jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint academic_calendars_user_id_key unique (user_id)
);

alter table public.academic_calendars enable row level security;

drop policy if exists "Users manage own academic_calendars" on public.academic_calendars;
create policy "Users manage own academic_calendars"
  on public.academic_calendars
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists academic_calendars_user_active_idx
  on public.academic_calendars (user_id, is_active);

comment on table public.academic_calendars is
  'Per-user semester calendar; teaching week calculation is derived from start_date + total_weeks.';

comment on column public.academic_calendars.periods_json is
  'Optional detailed academic periods (lecture/break/exam/etc). When present, teaching week excludes non-lecture weeks.';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  DONE — summary of what was created / updated                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- profiles                  → 13 extra columns (student_id, program, campus…)
-- university_connections    → table + RLS
-- timetable_entries         → table + display_name/slot_color + RLS + indexes
-- academic_calendars        → table + RLS + index
--
-- All tables use Row-Level Security so users can only read/write their own data.
-- The mobile app writes to these tables via profileDb.ts, timetableDb.ts, and
-- academicCalendarDb.ts whenever the user is signed in.
