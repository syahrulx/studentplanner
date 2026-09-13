-- ---------------------------------------------------------------------------
-- Stale multiplayer sessions.
--
-- Two gaps this closes:
--
-- 1. Leaving a lobby only tore down the client's realtime channel. The
--    `quiz_sessions` row stayed `waiting` forever, and its invite code stayed
--    joinable, so a friend could walk into a lobby whose host left an hour ago.
--
-- 2. `finish_quiz_participant` only closes a match and awards the winner bonus
--    when every participant has finished. A player who quits mid-match means
--    that never becomes true: the finisher's own score is saved (that happens
--    before the check), but the match stays `in_progress` forever and the +20
--    bonus is never awarded.
--
-- Both are resolved by the same reaper, scoped to the caller's own sessions so
-- it needs no elevated reach. It runs when a session is created, so each player
-- clears their own abandoned matches as they keep playing.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------

create index if not exists idx_quiz_sessions_host_status_created
  on public.quiz_sessions (host_id, status, created_at);

create or replace function public.resolve_stale_quiz_sessions(
  p_waiting_minutes int default 30,
  p_active_minutes int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_wait_cut  timestamptz := now() - make_interval(mins => greatest(1, p_waiting_minutes));
  v_act_cut   timestamptz := now() - make_interval(mins => greatest(1, p_active_minutes));
  v_deleted   int := 0;
  v_closed    int := 0;
  v_session   record;
  v_top       int;
  v_tie       int;
  v_winner    uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- ── 1. Abandoned lobbies ────────────────────────────────────────────────
  -- Nobody is coming after half an hour. Participants cascade with the row.
  with dead as (
    delete from public.quiz_sessions s
    where s.host_id = v_user
      and s.status = 'waiting'
      and s.created_at < v_wait_cut
    returning 1
  )
  select count(*)::int into v_deleted from dead;

  -- ── 2. Matches nobody finished ──────────────────────────────────────────
  -- Only sessions this caller took part in, so a player resolves their own
  -- abandoned matches rather than reaching into anyone else's.
  for v_session in
    select s.id, s.mode
    from public.quiz_sessions s
    join public.quiz_participants p on p.session_id = s.id and p.user_id = v_user
    where s.status = 'in_progress'
      and coalesce(s.started_at, s.created_at) < v_act_cut
  loop
    -- A player who walked away keeps whatever they had scored. Marking them
    -- finished is what lets the match resolve at all.
    update public.quiz_participants
       set finished = true
     where session_id = v_session.id
       and finished = false;

    select max(score) into v_top
      from public.quiz_participants where session_id = v_session.id;
    select count(*) into v_tie
      from public.quiz_participants where session_id = v_session.id and score = v_top;

    -- The winner bonus only exists in multiplayer, and finish_quiz_participant
    -- gates it the same way. Without the mode check a solo quiz abandoned
    -- mid-game would earn XP that completing it never would, which turns
    -- walking away into the better move. A match nobody scored in, or one that
    -- ended level, has no winner to name.
    if v_session.mode = 'multiplayer' and v_top > 0 and v_tie = 1 then
      select user_id into v_winner
        from public.quiz_participants
       where session_id = v_session.id and score = v_top
       limit 1;

      update public.quiz_scores
         set xp_earned = score + 20
       where session_id = v_session.id
         and user_id = v_winner
         and xp_earned = score;
    end if;

    update public.quiz_sessions
       set status = 'finished',
           finished_at = coalesce(finished_at, now())
     where id = v_session.id;

    v_closed := v_closed + 1;
  end loop;

  return jsonb_build_object('lobbies_deleted', v_deleted, 'matches_closed', v_closed);
end
$$;

revoke all on function public.resolve_stale_quiz_sessions(int, int) from public, anon;
grant execute on function public.resolve_stale_quiz_sessions(int, int) to authenticated;
