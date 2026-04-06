-- Fix academic calendar persistence: client upserts break_* + ON CONFLICT (user_id)
-- require columns and a unique constraint. Without these, saves fail silently (old client
-- returned a fake row) and teaching week resets on next load.

alter table public.academic_calendars
  add column if not exists break_start_date date,
  add column if not exists break_end_date date;

-- Keep a single row per user so upsert(onConflict: user_id) works and maybeSingle() is stable.
delete from public.academic_calendars c
where c.ctid not in (
  select distinct on (user_id) ctid
  from public.academic_calendars
  order by user_id, created_at desc nulls last, id desc
);

create unique index if not exists academic_calendars_user_id_unique
  on public.academic_calendars (user_id);
