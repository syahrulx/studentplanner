-- Persist university portal link on profiles (read on app cold start with timetable)
alter table public.profiles
  add column if not exists university_id text,
  add column if not exists last_sync timestamptz;

comment on column public.profiles.university_id is 'Linked portal id (e.g. uitm); set when user saves imported timetable';
comment on column public.profiles.last_sync is 'ISO time of last successful portal timetable/profile sync';
