-- Older databases may have academic_calendars without periods_json; PostgREST then
-- errors: "Could not find the 'periods_json' column ... in the schema cache".

alter table public.academic_calendars
  add column if not exists periods_json jsonb;

comment on column public.academic_calendars.periods_json is
  'Optional detailed academic periods (lecture/break/exam/etc). When present, teaching week excludes non-lecture weeks.';

-- Refresh PostgREST schema cache so the API sees the column immediately.
notify pgrst, 'reload schema';
