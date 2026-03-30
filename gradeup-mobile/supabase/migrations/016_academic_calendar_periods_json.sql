-- Store detailed academic periods (lecture/break/exam) for teaching-week calculations.
-- Safe to run multiple times.

alter table public.academic_calendars
  add column if not exists periods_json jsonb;

comment on column public.academic_calendars.periods_json is
  'Optional detailed academic periods (lecture/break/exam/etc). When present, teaching week excludes non-lecture weeks.';

