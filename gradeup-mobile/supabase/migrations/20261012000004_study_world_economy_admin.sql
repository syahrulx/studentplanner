-- =============================================================================
-- Study World economy: admin lists (all wallets, leaderboards with accounts).
--
-- Run AFTER the website migration 202610120003_study_world_economy.sql
-- (it creates the wallet, fish and weekly stats tables used here).
--
-- Read-only: two admin functions, no table or data changes. Players never
-- see these; the player leaderboard (study_world_leaderboard) still shows
-- nicknames only.
-- =============================================================================

/**
 * Every wallet, for the admin website. Search by nickname, name, email or
 * user id. p_sort: 'coins' (default), 'fish', 'recent'.
 */
create or replace function public.admin_study_world_wallets(
  p_query text default null,
  p_sort text default 'coins',
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  user_id uuid,
  nickname text,
  name text,
  email text,
  coins bigint,
  worms int,
  trash int,
  fish_in_bag bigint,
  ultra_in_bag bigint,
  items_owned bigint,
  last_active timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_raw text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text;
  v_uuid uuid;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if v_raw is not null then
    v_like := '%' || replace(replace(v_raw, '%', '\%'), '_', '\_') || '%';
    begin
      v_uuid := v_raw::uuid;
    exception when others then
      v_uuid := null;
    end;
  end if;

  return query
  with base as (
    select
      s.user_id,
      w.nickname,
      p.name,
      u.email::text as email,
      s.coins,
      s.worms,
      s.trash,
      (select count(*) from public.study_world_fish f where f.user_id = s.user_id) as fish_in_bag,
      (select count(*) from public.study_world_fish f
         join public.study_world_fish_species sp on sp.species = f.species
        where f.user_id = s.user_id and sp.rarity = 'ultra') as ultra_in_bag,
      (select count(*) from public.study_world_owned_items o where o.user_id = s.user_id) as items_owned,
      greatest(s.updated_at, s.last_cast_at) as last_active
    from public.study_world_player_state s
    left join public.study_world_profiles w on w.user_id = s.user_id
    left join public.profiles p on p.id = s.user_id
    left join auth.users u on u.id = s.user_id
    where v_raw is null
       or s.user_id = v_uuid
       or w.nickname ilike v_like
       or p.name ilike v_like
       or u.email ilike v_like
  )
  select b.*, count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'fish' then b.fish_in_bag end desc nulls last,
    case when p_sort = 'recent' then b.last_active end desc nulls last,
    b.coins desc,
    b.last_active desc nulls last
  limit v_limit offset v_offset;
end;
$$;

/**
 * The same leaderboards players see, with the account behind each nickname
 * so an admin can open the player. Boards: biggest_fish, fish_caught,
 * harvests, quiz_correct, trash_thrown (this week, Malaysia time),
 * collection (all time), and coins (richest wallets, admin only).
 * Worm catches are excluded, as on the player boards.
 */
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

revoke all on function public.admin_study_world_wallets(text, text, int, int) from public, anon;
revoke all on function public.admin_study_world_leaderboard(text, int) from public, anon;
grant execute on function public.admin_study_world_wallets(text, text, int, int) to authenticated;
grant execute on function public.admin_study_world_leaderboard(text, int) to authenticated;
