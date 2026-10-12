-- =============================================================================
-- Study World: one player's full picture for the admin website.
--
-- Run AFTER 20261012000001_study_world_admin.sql. Read-only: it adds one
-- admin function and changes no data.
--
-- Returns, for one account: the Study World avatar row, the basic Rencana
-- account details (the same fields the admin Users page already shows), ban
-- history, reports against them (by account or by their current nickname),
-- reports they sent, and admin actions about them.
-- =============================================================================

create or replace function public.admin_study_world_player_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nick text;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select w.nickname into v_nick from public.study_world_profiles w where w.user_id = p_user_id;

  return jsonb_build_object(
    'world', (
      select jsonb_build_object(
        'nickname', w.nickname, 'look', w.look,
        'show_real_name', w.show_real_name, 'updated_at', w.updated_at)
      from public.study_world_profiles w where w.user_id = p_user_id
    ),
    'account', (
      select jsonb_build_object(
        'name', p.name,
        'email', u.email,
        'student_id', p.student_id,
        'university_id', p.university_id,
        'university_name', un.name,
        'country', p.country,
        'device_platform', p.device_platform,
        'status', p.status,
        'subscription_plan', p.subscription_plan,
        'subscription_status', p.subscription_status,
        'subscription_expires_at', p.subscription_expires_at,
        'created_at', coalesce(p.created_at, u.created_at),
        'last_sign_in_at', u.last_sign_in_at)
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.universities un on un.id = p.university_id
      where u.id = p_user_id
    ),
    'bans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'reason', b.reason, 'expires_at', b.expires_at, 'created_at', b.created_at,
        'banned_by_email', a.email, 'lifted_at', b.lifted_at, 'lift_reason', b.lift_reason,
        'active', b.lifted_at is null and (b.expires_at is null or b.expires_at > now()))
        order by b.created_at desc)
      from public.study_world_bans b
      left join auth.users a on a.id = b.banned_by
      where b.user_id = p_user_id
    ), '[]'::jsonb),
    'reports_against', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'created_at', r.created_at, 'reason', r.reason, 'details', r.details,
        'status', r.status, 'reported_nickname', r.reported_nickname, 'map_key', r.map_key,
        'room', r.room, 'by_account', r.reported_user_id = p_user_id)
        order by r.created_at desc)
      from public.study_world_reports r
      where r.reported_user_id = p_user_id
         or (v_nick is not null and lower(r.reported_nickname) = lower(v_nick))
    ), '[]'::jsonb),
    'reports_sent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'created_at', r.created_at, 'reason', r.reason,
        'status', r.status, 'reported_nickname', r.reported_nickname)
        order by r.created_at desc)
      from public.study_world_reports r
      where r.reporter_id = p_user_id
    ), '[]'::jsonb),
    'admin_actions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'created_at', l.created_at, 'action', l.action,
        'reason', l.reason, 'admin_email', a.email)
        order by l.created_at desc)
      from public.study_world_admin_log l
      left join auth.users a on a.id = l.admin_id
      where l.target_user_id = p_user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_study_world_player_detail(uuid) from public, anon;
grant execute on function public.admin_study_world_player_detail(uuid) to authenticated;
