alter table public.user_courses
  add column if not exists sort_order integer not null default 2147483647;

with ranked as (
  select
    user_id,
    subject_id,
    row_number() over (partition by user_id order by subject_id) - 1 as position
  from public.user_courses
)
update public.user_courses course
set sort_order = ranked.position
from ranked
where course.user_id = ranked.user_id
  and course.subject_id = ranked.subject_id
  and course.sort_order = 2147483647;

create index if not exists user_courses_user_sort_idx
  on public.user_courses (user_id, sort_order, subject_id);

create or replace function public.rename_user_course(p_subject_id text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or nullif(trim(p_name), '') is null then
    raise exception 'A subject name is required'
      using errcode = '22023';
  end if;

  update public.user_courses
  set name = left(trim(p_name), 120)
  where user_id = auth.uid()
    and subject_id = p_subject_id;

  if not found then
    raise exception 'Subject not found'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.rename_user_course(text, text) from public;
grant execute on function public.rename_user_course(text, text) to authenticated;

create or replace function public.reorder_user_courses(p_subject_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_count integer;
  distinct_requested_count integer;
  course_count integer;
  matched_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in'
      using errcode = '42501';
  end if;

  select count(*), count(distinct requested.subject_id)
  into requested_count, distinct_requested_count
  from unnest(p_subject_ids) as requested(subject_id);

  select count(*)
  into course_count
  from public.user_courses
  where user_id = auth.uid();

  select count(*)
  into matched_count
  from public.user_courses
  where user_id = auth.uid()
    and subject_id = any(p_subject_ids);

  if requested_count <> course_count
    or distinct_requested_count <> course_count
    or matched_count <> course_count then
    raise exception 'The subject order is incomplete'
      using errcode = '22023';
  end if;

  update public.user_courses course
  set sort_order = requested.position - 1
  from unnest(p_subject_ids) with ordinality as requested(subject_id, position)
  where course.user_id = auth.uid()
    and course.subject_id = requested.subject_id;
end;
$$;

revoke all on function public.reorder_user_courses(text[]) from public;
grant execute on function public.reorder_user_courses(text[]) to authenticated;
