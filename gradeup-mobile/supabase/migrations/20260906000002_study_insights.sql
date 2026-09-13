-- ---------------------------------------------------------------------------
-- Study insights: turn the data the app already collects (flashcard_reviews,
-- quiz_attempts) into something the student can act on.
--
-- Everything is one RPC so the Study tab makes a single round trip instead of
-- three, and all aggregation happens in Postgres rather than pulling thousands
-- of rows to the phone.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Missed-question bank.
--
-- A question is "missed" only when the student's MOST RECENT attempt at it was
-- wrong. Wrong-then-right later means it is learned and must drop out, or the
-- retry list never shrinks and the student re-drills what they already fixed.
-- ===========================================================================
drop view if exists public.quiz_missed_questions;

create or replace view public.quiz_missed_bank
with (security_invoker = true) as
  select latest.*
  from (
    select distinct on (a.user_id, lower(btrim(a.question)))
      a.user_id,
      a.id            as attempt_id,
      a.question,
      a.options,
      a.correct_index,
      a.expected_answer,
      a.explanation,
      a.source_note_id,
      a.source_type,
      a.difficulty,
      a.correct,
      a.created_at
    from public.quiz_attempts a
    order by a.user_id, lower(btrim(a.question)), a.created_at desc
  ) latest
  where latest.correct = false;

comment on view public.quiz_missed_bank is
  'One row per distinct question whose latest attempt was wrong. Drives "retry missed".';

-- ===========================================================================
-- One call for the whole Study-now surface.
--
-- Returns:
--   reviews    { total, again, retention_pct, days_active, streak }
--   weak_notes [ { note_id, title, subject_id, attempts, accuracy_pct } ]
--   missed     { count }
-- ===========================================================================
create or replace function public.get_study_insights(
  p_days int default 30,
  p_weak_limit int default 5,
  p_weak_max_accuracy int default 70,
  p_weak_min_attempts int default 3
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_since    timestamptz := now() - make_interval(days => greatest(1, p_days));
  v_total    int := 0;
  v_again    int := 0;
  v_days     int := 0;
  v_streak   int := 0;
  v_last_day date;
  v_weak     jsonb := '[]'::jsonb;
  v_missed   int := 0;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Flashcard review activity in the window.
  select
    count(*)::int,
    coalesce(sum(case when r.rating = 1 then 1 else 0 end), 0)::int,
    count(distinct (r.review_at at time zone 'UTC')::date)::int
  into v_total, v_again, v_days
  from public.flashcard_reviews r
  where r.user_id = v_user
    and r.review_at >= v_since;

  -- Current daily streak, via gaps-and-islands: for a run of consecutive days
  -- ordered newest first, `day + (row_number - 1)` is constant, so the size of
  -- the island anchored on the most recent day is the streak.
  --
  -- Yesterday still counts as alive: a student who studied last night should
  -- not be told their streak broke before they have had a chance to study today.
  with days as (
    select distinct (r.review_at at time zone 'UTC')::date as d
    from public.flashcard_reviews r
    where r.user_id = v_user
  ),
  ranked as (
    select d, (row_number() over (order by d desc))::int as rn
    from days
    where d <= current_date
  )
  select
    (select max(d) from ranked),
    (select count(*)::int from ranked where d + (rn - 1) = (select max(d) from ranked))
  into v_last_day, v_streak;

  if v_last_day is null or v_last_day < current_date - 1 then
    v_streak := 0;
  end if;

  -- Weakest notes: low accuracy first, but only once there is enough evidence.
  -- One unlucky question should not brand a whole topic as weak.
  select coalesce(jsonb_agg(to_jsonb(w) order by w.accuracy_pct asc, w.attempts desc), '[]'::jsonb)
  into v_weak
  from (
    select
      m.source_note_id                   as note_id,
      coalesce(n.title, 'Untitled note') as title,
      n.subject_id                       as subject_id,
      m.attempts,
      m.accuracy_pct
    from public.quiz_note_mastery m
    left join public.notes n
      on n.id = m.source_note_id and n.user_id = m.user_id
    where m.user_id = v_user
      and m.attempts >= greatest(1, p_weak_min_attempts)
      and m.accuracy_pct <= least(100, greatest(0, p_weak_max_accuracy))
    order by m.accuracy_pct asc, m.attempts desc
    limit greatest(1, p_weak_limit)
  ) w;

  select count(*)::int into v_missed
  from public.quiz_missed_bank b
  where b.user_id = v_user;

  return jsonb_build_object(
    'reviews', jsonb_build_object(
      'total', v_total,
      'again', v_again,
      'retention_pct', case when v_total > 0 then round(100.0 * (v_total - v_again) / v_total)::int else null end,
      'days_active', v_days,
      'streak', v_streak
    ),
    'weak_notes', v_weak,
    'missed', jsonb_build_object('count', v_missed)
  );
end
$$;

revoke all on function public.get_study_insights(int, int, int, int) from public, anon;
grant execute on function public.get_study_insights(int, int, int, int) to authenticated;
