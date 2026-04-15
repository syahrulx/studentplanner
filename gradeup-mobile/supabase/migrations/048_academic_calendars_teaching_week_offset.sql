-- Optional correction when calendar-derived teaching week does not match the student's real week.
alter table public.academic_calendars
  add column if not exists teaching_week_offset integer not null default 0;

comment on column public.academic_calendars.teaching_week_offset is
  'Added to calendar-derived teaching week before clamping (e.g. admin calendar segment slightly off).';
