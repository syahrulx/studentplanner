-- Belt-and-braces user deletion.
--
-- Most app tables already `on delete cascade` from auth.users(id), so removing
-- the auth user (via admin.auth.admin.deleteUser) takes care of ~everything.
-- This function exists so the admin_users edge function can (1) call it
-- *before* the auth delete, ensuring app data is removed even in environments
-- where any of these tables lack a cascade, and (2) give us one place to grow
-- as new tables are added.
--
-- Idempotent: safe to re-run, safe to call when rows don't exist.
-- Security: SECURITY DEFINER so edge function (service role) can invoke via
-- rpc('admin_cascade_delete_user', ...). We additionally gate on a
-- non-anonymous JWT or service-role caller to avoid privilege escalation if
-- an RLS-protected context ever invokes this indirectly.

create or replace function public.admin_cascade_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- Only allow admins (via is_admin) or service_role (no auth.uid) to call.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'not_admin';
  end if;

  -- Tables where the FK already cascades from auth.users — deleting here is a
  -- no-op after that cascade runs, but harmless and defensive if the cascade
  -- is ever dropped.
  delete from public.timetable_entries       where user_id = p_user_id;
  delete from public.class_attendance_events where user_id = p_user_id;
  delete from public.user_courses            where user_id = p_user_id;
  delete from public.tasks                   where user_id = p_user_id;
  delete from public.sow_imports             where user_id = p_user_id;
  delete from public.ai_token_usage          where user_id = p_user_id;

  -- Community surface: reactions, friend requests, circles, shared tasks.
  -- Use dynamic SQL because not every deploy has all these tables yet.
  perform 1 from information_schema.tables where table_schema='public' and table_name='quick_reactions';
  if found then
    execute 'delete from public.quick_reactions where sender_id = $1 or receiver_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='friend_requests';
  if found then
    execute 'delete from public.friend_requests where requester_id = $1 or recipient_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='friendships';
  if found then
    execute 'delete from public.friendships where user_id = $1 or friend_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='circle_members';
  if found then
    execute 'delete from public.circle_members where user_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='circle_invitations';
  if found then
    execute 'delete from public.circle_invitations where inviter_id = $1 or invitee_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='shared_tasks';
  if found then
    execute 'delete from public.shared_tasks where owner_id = $1 or recipient_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='task_share_streams';
  if found then
    execute 'delete from public.task_share_streams where owner_id = $1 or recipient_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='user_locations';
  if found then
    execute 'delete from public.user_locations where user_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='custom_friend_location_visibility';
  if found then
    execute 'delete from public.custom_friend_location_visibility where user_id = $1 or friend_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='spotify_presence';
  if found then
    execute 'delete from public.spotify_presence where user_id = $1' using p_user_id;
  end if;

  perform 1 from information_schema.tables where table_schema='public' and table_name='user_reports';
  if found then
    execute 'delete from public.user_reports where reporter_id = $1 or reported_user_id = $1' using p_user_id;
  end if;

  -- Profile last (many of the above reference it).
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.admin_cascade_delete_user(uuid) from public;
grant execute on function public.admin_cascade_delete_user(uuid) to service_role, authenticated;
