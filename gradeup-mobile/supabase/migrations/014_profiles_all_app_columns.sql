-- All profile columns the mobile app reads/writes (safe if some already exist).
-- Run this if you see: "Could not find the 'part' column of 'profiles' in the schema cache"

alter table public.profiles
  add column if not exists academic_level text,
  add column if not exists student_id text,
  add column if not exists program text,
  add column if not exists part smallint,
  add column if not exists avatar_url text,
  add column if not exists campus text,
  add column if not exists faculty text,
  add column if not exists study_mode text,
  add column if not exists current_semester smallint,
  add column if not exists mystudent_email text,
  add column if not exists university_id text,
  add column if not exists last_sync timestamptz;
