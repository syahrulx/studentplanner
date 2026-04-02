-- Course usage: find which "programme course" is most used.
-- In this app, `public.user_courses` stores per-user selected courses.
-- We define:
-- - course (programme course) = distinct `subject_id` (and its `name`)
-- - popularity = number of distinct users for each subject_id
-- - total_courses = number of distinct subjects in user_courses

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

    -- Distinct "programme courses" selected by users
    'total_courses', (select count(distinct subject_id) from public.user_courses),

    'total_timetables', (select count(*) from public.timetable_entries)
  );

  return out;
end;
$$;

create or replace function public.admin_course_usage_top(limit_count int default 10)
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

  out :=
    (
      select jsonb_agg(
        jsonb_build_object(
          'course_id', s.subject_id,
          'course_name', s.name,
          'user_count', s.user_count
        )
        order by user_count desc
      )
      from (
        select subject_id,
               max(name) as name,
               count(distinct user_id)::int as user_count
        from public.user_courses
        group by subject_id
        order by user_count desc
        limit limit_count
      ) s
    );

  return coalesce(out, '[]'::jsonb);
end;
$$;

