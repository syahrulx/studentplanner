-- =============================================================================
-- Study World quiz: per-question numbers for the admin website.
--
-- Run AFTER the website migration 202610120004_study_world_garden_quiz.sql
-- (it creates study_world_quiz_questions, _rounds and _answers).
--
-- Read-only: one admin function, no table or data changes. Rounds and answers
-- have RLS on and no policies, so the admin website can only read these
-- totals through this function. No player names or answers are returned,
-- only counts per question.
-- =============================================================================

create or replace function public.admin_study_world_quiz_stats()
returns table(
  question_id uuid,
  times_asked bigint,
  answers bigint,
  correct bigint,
  last_asked timestamptz
)
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
    select r.question_id,
           count(distinct r.id) as times_asked,
           count(a.user_id) as answers,
           count(a.user_id) filter (where a.correct) as correct,
           max(r.started_at) as last_asked
      from public.study_world_quiz_rounds r
      left join public.study_world_quiz_answers a on a.round_id = r.id
     group by r.question_id;
end;
$$;

revoke all on function public.admin_study_world_quiz_stats() from public, anon;
grant execute on function public.admin_study_world_quiz_stats() to authenticated;
