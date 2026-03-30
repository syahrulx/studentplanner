-- Optional MyStudent / manual profile fields (per auth user)
alter table public.profiles
  add column if not exists student_id text,
  add column if not exists program text,
  add column if not exists part smallint;

comment on column public.profiles.student_id is 'Matric / student number (e.g. from MyStudent connect)';
comment on column public.profiles.program is 'Primary program or faculty line (e.g. from MyStudent)';
comment on column public.profiles.part is 'Semester part / year level when applicable';
