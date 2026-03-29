-- Persist which portal programme semester the academic calendar start was last aligned to.
-- Survives app reinstall; used so teaching week 1 can be anchored after fetch/load.

alter table public.profiles
  add column if not exists portal_teaching_anchored_semester smallint;

comment on column public.profiles.portal_teaching_anchored_semester is
  'Last current_semester value we snapped academic_calendar.start_date to (teaching week 1 = anchor day).';
