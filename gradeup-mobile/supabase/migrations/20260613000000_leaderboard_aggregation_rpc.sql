-- =============================================================================
-- 20260613000000: Server-side leaderboard aggregation
-- =============================================================================
-- Previously the quiz and word-game leaderboards were aggregated client-side
-- over only the 5000 most-recent rows (`limit(5000)`). For the GLOBAL scope this
-- truncated each user's history, so a user's total score/XP was undercounted and
-- could differ from what the FRIENDS scope showed (friends fetched a complete
-- per-user history because the row pool was scoped to a handful of user ids).
--
-- These functions move aggregation into the database (SUM ... GROUP BY user_id)
-- so totals are always complete and identical regardless of scope.

-- Quiz leaderboard: sum of xp_earned per user.
--   p_user_ids: NULL  -> global (all users)
--               array -> restrict to these users (friends scope = friends + self)
--   p_since:    NULL  -> all time; otherwise only rows created at/after this ts
--   p_limit:    NULL  -> no limit (friends); otherwise top-N (global uses 50)
create or replace function public.get_quiz_leaderboard(
  p_user_ids uuid[] default null,
  p_since timestamptz default null,
  p_limit int default null
)
returns table (
  user_id uuid,
  total_xp bigint,
  games_played bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    qs.user_id,
    coalesce(sum(qs.xp_earned), 0)::bigint as total_xp,
    count(*)::bigint as games_played
  from public.quiz_scores qs
  where (p_user_ids is null or qs.user_id = any (p_user_ids))
    and (p_since is null or qs.created_at >= p_since)
  group by qs.user_id
  order by total_xp desc
  limit p_limit;
$$;

-- Word-game leaderboard: sum of best per-puzzle score per user.
create or replace function public.get_word_game_leaderboard(
  p_user_ids uuid[] default null,
  p_limit int default null
)
returns table (
  user_id uuid,
  total_score bigint,
  puzzles_solved bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ws.user_id,
    coalesce(sum(ws.score), 0)::bigint as total_score,
    count(*)::bigint as puzzles_solved
  from public.word_game_scores ws
  where (p_user_ids is null or ws.user_id = any (p_user_ids))
  group by ws.user_id
  order by total_score desc
  limit p_limit;
$$;

-- A single user's global total + rank, so the leaderboard can always show the
-- current user's own card even when they fall outside the displayed top-N.
create or replace function public.get_quiz_user_rank(
  p_user_id uuid,
  p_since timestamptz default null
)
returns table (
  total_xp bigint,
  games_played bigint,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select
      qs.user_id,
      sum(qs.xp_earned)::bigint as total_xp,
      count(*)::bigint as games_played
    from public.quiz_scores qs
    where (p_since is null or qs.created_at >= p_since)
    group by qs.user_id
  )
  select
    t.total_xp,
    t.games_played,
    (select count(*) + 1 from totals t2 where t2.total_xp > t.total_xp)::bigint as rank
  from totals t
  where t.user_id = p_user_id;
$$;

create or replace function public.get_word_game_user_rank(
  p_user_id uuid
)
returns table (
  total_score bigint,
  puzzles_solved bigint,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select
      ws.user_id,
      sum(ws.score)::bigint as total_score,
      count(*)::bigint as puzzles_solved
    from public.word_game_scores ws
    group by ws.user_id
  )
  select
    t.total_score,
    t.puzzles_solved,
    (select count(*) + 1 from totals t2 where t2.total_score > t.total_score)::bigint as rank
  from totals t
  where t.user_id = p_user_id;
$$;

grant execute on function public.get_quiz_leaderboard(uuid[], timestamptz, int) to anon, authenticated;
grant execute on function public.get_word_game_leaderboard(uuid[], int) to anon, authenticated;
grant execute on function public.get_quiz_user_rank(uuid, timestamptz) to anon, authenticated;
grant execute on function public.get_word_game_user_rank(uuid) to anon, authenticated;
