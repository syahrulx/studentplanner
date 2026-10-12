-- =============================================================================
-- RenCity: add the "Cozy dorm" board (most hearts this week) to the admin
-- leaderboard, matching the player board in website migration
-- 202610130005_rencity_dorm_more.sql. Run AFTER that file.
--
-- Read-only: replaces one admin function (same name, arguments and columns).
-- No table or data changes.
-- =============================================================================

create or replace function public.admin_study_world_leaderboard(p_board text, p_limit int default 50)
returns table(rank int, user_id uuid, nickname text, email text, value numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_col text;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  if p_board = 'collection' then
    return query
      select (row_number() over (order by count(*) desc, min(c.first_caught_at)))::int,
             c.user_id, w.nickname, u.email::text, count(*)::numeric
        from public.study_world_collection c
        left join public.study_world_profiles w on w.user_id = c.user_id
        left join auth.users u on u.id = c.user_id
       where c.fair_caught > 0
       group by c.user_id, w.nickname, u.email
       order by 1
       limit v_limit;
  elsif p_board = 'cozy_dorm' then
    return query
      select (row_number() over (order by count(*) desc, min(l.dorm_user::text)))::int,
             l.dorm_user, w.nickname, u.email::text, count(*)::numeric
        from public.study_world_dorm_likes l
        left join public.study_world_profiles w on w.user_id = l.dorm_user
        left join auth.users u on u.id = l.dorm_user
       where l.week_start = public.study_world_week()
       group by l.dorm_user, w.nickname, u.email
       order by 1
       limit v_limit;
  elsif p_board = 'coins' then
    return query
      select (row_number() over (order by s.coins desc, s.user_id))::int,
             s.user_id, w.nickname, u.email::text, s.coins::numeric
        from public.study_world_player_state s
        left join public.study_world_profiles w on w.user_id = s.user_id
        left join auth.users u on u.id = s.user_id
       where s.coins > 0
       order by 1
       limit v_limit;
  elsif p_board in ('biggest_fish', 'fish_caught', 'harvests', 'quiz_correct', 'trash_thrown') then
    v_col := case p_board when 'biggest_fish' then 'biggest_fish_kg' else p_board end;
    return query execute format(
      'select (row_number() over (order by ws.%1$I desc, ws.user_id))::int,
              ws.user_id, w.nickname, u.email::text, ws.%1$I::numeric
         from public.study_world_weekly_stats ws
         left join public.study_world_profiles w on w.user_id = ws.user_id
         left join auth.users u on u.id = ws.user_id
        where ws.week_start = public.study_world_week() and ws.%1$I > 0
        order by 1
        limit %2$s',
      v_col, v_limit);
  else
    raise exception 'Unknown leaderboard.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.admin_study_world_leaderboard(text, int) from public, anon;
grant execute on function public.admin_study_world_leaderboard(text, int) to authenticated;
