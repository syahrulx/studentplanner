-- MyStudent / portal profile fields (campus, faculty, semester on record, personal email from portal)
alter table public.profiles
  add column if not exists campus text,
  add column if not exists faculty text,
  add column if not exists study_mode text,
  add column if not exists current_semester smallint,
  add column if not exists mystudent_email text;

comment on column public.profiles.campus is 'Campus name from MyStudent profile (e.g. UiTM Kampus Sungai Petani)';
comment on column public.profiles.faculty is 'Faculty / college line from MyStudent';
comment on column public.profiles.study_mode is 'Mod pengajian (e.g. Sepenuh Masa)';
comment on column public.profiles.current_semester is 'Current semester number from portal when available';
comment on column public.profiles.mystudent_email is 'Personal email shown on MyStudent profile (not the mystudent.uitm login)';
