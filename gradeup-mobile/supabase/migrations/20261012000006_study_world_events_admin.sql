-- =============================================================================
-- Study World events: reminder counts for the admin website.
--
-- Run AFTER the website migration 202610120005_study_world_library_events.sql
-- (it creates study_world_events and study_world_event_reminders).
--
-- Read-only: one admin function, no table or data changes. Players can only
-- read their own reminders (RLS), so admins see totals through this function.
-- It returns counts per event only, never who set a reminder.
-- =============================================================================

create or replace function public.admin_study_world_event_reminder_counts()
returns table(event_id uuid, reminders bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select r.event_id, count(*)::bigint
      from public.study_world_event_reminders r
     group by r.event_id;
end;
$$;

revoke all on function public.admin_study_world_event_reminder_counts() from public, anon;
grant execute on function public.admin_study_world_event_reminder_counts() to authenticated;
