-- Fix: admin_dashboard_overview.total_courses was counting public.courses,
-- but the mobile app stores courses in public.user_courses (coursesDb.ts).

create or replace function public.admin_dashboard_overview()
returns jsonb
language plpgsql
security definer
as $$
declare
  out jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  out := jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'total_universities', (select count(*) from public.universities),
    'total_courses', (select count(*) from public.user_courses),
    'total_timetables', (select count(*) from public.timetable_entries)
  );
  return out;
end;
$$;

