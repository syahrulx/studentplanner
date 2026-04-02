-- Differentiate:
-- - course owners: distinct users that have rows in user_courses
-- - subjects: total rows in user_courses (each row = one subject for one user)

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

    -- course owners = distinct user_id that has at least 1 course row
    'total_course_owners', (select count(distinct user_id) from public.user_courses),

    -- subjects = total number of subject rows across all users
    'total_subjects', (select count(*) from public.user_courses),

    -- backward compatibility with older UI key name
    'total_courses', (select count(*) from public.user_courses),

    'total_timetables', (select count(*) from public.timetable_entries)
  );

  return out;
end;
$$;

