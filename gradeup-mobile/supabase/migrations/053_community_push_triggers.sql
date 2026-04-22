-- Postgres triggers that turn community events into remote Expo pushes.
-- Each trigger builds a jsonb payload and calls public._send_community_push(jsonb).
--
-- Events covered:
--   reactions      : INSERT on public.quick_reactions
--   friend request : INSERT on public.friendships where status = 'pending'
--   friend accept  : UPDATE on public.friendships where status -> 'accepted'
--   circle invite  : INSERT on public.circle_invitations where status = 'pending'
--   circle response: UPDATE on public.circle_invitations where status: pending -> accepted|rejected
--   shared task    : INSERT on public.shared_tasks
--   shared task status: UPDATE on public.shared_tasks (pending -> accepted | declined)
--   shared task done: UPDATE on public.shared_tasks.recipient_completed false -> true
--
-- Notes:
--   • All triggers are AFTER INSERT/UPDATE, so the row is committed first.
--   • They call the helper defensively wrapped in an exception block — a failed push must
--     never roll back a legitimate DB write.
--   • `collapse_key` groups notifications so repeat events (e.g. multiple reactions in a row)
--     collapse into a single banner on the device.

-- ─── helper to look up a user's display name for push titles ──────────────────────────────
create or replace function public._display_name_for(user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(name), ''), 'Someone') from public.profiles where id = user_id
$$;

grant execute on function public._display_name_for(uuid) to postgres, service_role;

-- ─── 1. QUICK REACTIONS (incl. bumps) ────────────────────────────────────────────────────
create or replace function public._on_quick_reaction_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  emoji       text;
  title_txt   text;
  body_txt    text;
begin
  sender_name := public._display_name_for(new.sender_id);
  emoji := case new.reaction_type
    when 'clap'   then '👏'
    when 'fire'   then '🔥'
    when 'heart'  then '❤️'
    when 'muscle' then '💪'
    when 'star'   then '⭐'
    when 'bump'   then '👋'
    else '✨'
  end;
  title_txt := sender_name || ' ' || emoji;
  body_txt  := coalesce(nullif(new.message, ''),
    case new.reaction_type
      when 'bump' then 'Sent you a nudge'
      else 'Sent you a reaction'
    end);

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.receiver_id),
    'title',            title_txt,
    'body',             body_txt,
    'category',         'reaction',
    'collapseKey',      'reaction:' || new.sender_id::text,
    'data', jsonb_build_object(
      'type',          'reaction',
      'reactionId',    new.id,
      'senderId',      new.sender_id,
      'reactionType',  new.reaction_type
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] reaction trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_quick_reaction_push on public.quick_reactions;
create trigger trg_quick_reaction_push
after insert on public.quick_reactions
for each row execute function public._on_quick_reaction_insert();

-- ─── 2. FRIEND REQUESTS ──────────────────────────────────────────────────────────────────
create or replace function public._on_friendship_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  requester_name := public._display_name_for(new.requester_id);

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.addressee_id),
    'title',            'New friend request',
    'body',             requester_name || ' wants to be your friend',
    'category',         'friend',
    'collapseKey',      'friend_req:' || new.requester_id::text,
    'data', jsonb_build_object(
      'type',         'friend_request',
      'friendshipId', new.id,
      'requesterId',  new.requester_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] friendship insert trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_friendship_push_insert on public.friendships;
create trigger trg_friendship_push_insert
after insert on public.friendships
for each row execute function public._on_friendship_insert();

-- ─── 3. FRIEND REQUEST ACCEPTED ──────────────────────────────────────────────────────────
create or replace function public._on_friendship_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  addressee_name text;
begin
  -- Only fire once, on the pending -> accepted transition.
  if not (old.status = 'pending' and new.status = 'accepted') then
    return new;
  end if;

  addressee_name := public._display_name_for(new.addressee_id);

  -- Notify the ORIGINAL requester that their request was accepted.
  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.requester_id),
    'title',            'Friend request accepted',
    'body',             addressee_name || ' accepted your request',
    'category',         'friend',
    'collapseKey',      'friend_acc:' || new.addressee_id::text,
    'data', jsonb_build_object(
      'type',         'friend_accepted',
      'friendshipId', new.id,
      'friendId',     new.addressee_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] friendship accepted trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_friendship_push_accept on public.friendships;
create trigger trg_friendship_push_accept
after update of status on public.friendships
for each row execute function public._on_friendship_accepted();

-- ─── 4. CIRCLE INVITATIONS ───────────────────────────────────────────────────────────────
create or replace function public._on_circle_invite_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter_name text;
  circle_name  text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  inviter_name := public._display_name_for(new.inviter_id);
  select coalesce(name, 'a circle') into circle_name from public.circles where id = new.circle_id;

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.invitee_id),
    'title',            'Circle invitation',
    'body',             inviter_name || ' invited you to ' || circle_name,
    'category',         'circle',
    'collapseKey',      'circle_inv:' || new.circle_id::text,
    'data', jsonb_build_object(
      'type',        'circle_invitation',
      'invitationId', new.id,
      'circleId',    new.circle_id,
      'inviterId',   new.inviter_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] circle invite insert trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_circle_invite_push_insert on public.circle_invitations;
create trigger trg_circle_invite_push_insert
after insert on public.circle_invitations
for each row execute function public._on_circle_invite_insert();

-- ─── 5. CIRCLE INVITATION RESPONSE (accepted / rejected) ─────────────────────────────────
create or replace function public._on_circle_invite_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invitee_name text;
  circle_name  text;
  title_txt    text;
  body_txt     text;
begin
  if not (old.status = 'pending' and new.status in ('accepted', 'rejected')) then
    return new;
  end if;

  invitee_name := public._display_name_for(new.invitee_id);
  select coalesce(name, 'your circle') into circle_name from public.circles where id = new.circle_id;

  if new.status = 'accepted' then
    title_txt := 'Invitation accepted';
    body_txt  := invitee_name || ' joined ' || circle_name;
  else
    title_txt := 'Invitation declined';
    body_txt  := invitee_name || ' declined to join ' || circle_name;
  end if;

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.inviter_id),
    'title',            title_txt,
    'body',             body_txt,
    'category',         'circle',
    'collapseKey',      'circle_resp:' || new.circle_id::text,
    'data', jsonb_build_object(
      'type',        'circle_invitation_response',
      'invitationId', new.id,
      'circleId',    new.circle_id,
      'status',      new.status,
      'inviteeId',   new.invitee_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] circle invite response trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_circle_invite_push_response on public.circle_invitations;
create trigger trg_circle_invite_push_response
after update of status on public.circle_invitations
for each row execute function public._on_circle_invite_response();

-- ─── 6. SHARED TASKS — sent ─────────────────────────────────────────────────────────────
create or replace function public._on_shared_task_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_name   text;
  circle_name  text;
  recipients   uuid[];
  title_txt    text;
  body_txt     text;
begin
  owner_name := public._display_name_for(new.owner_id);

  -- Determine recipients:
  --   • Direct share: recipient_id
  --   • Circle share: every circle member except the owner
  if new.recipient_id is not null then
    recipients := array[new.recipient_id];
    title_txt  := 'Task shared with you';
    body_txt   := owner_name || ' shared a task with you';
  elsif new.circle_id is not null then
    select coalesce(array_agg(cm.user_id) filter (where cm.user_id <> new.owner_id), '{}')
    into recipients
    from public.circle_members cm
    where cm.circle_id = new.circle_id;

    select coalesce(name, 'your circle') into circle_name from public.circles where id = new.circle_id;
    title_txt := 'Task shared in ' || circle_name;
    body_txt  := owner_name || ' shared a task with ' || circle_name;
  else
    return new;
  end if;

  if recipients is null or array_length(recipients, 1) is null then
    return new;
  end if;

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', to_jsonb(recipients),
    'title',            title_txt,
    'body',             body_txt,
    'category',         'shared_task',
    'collapseKey',      'shared_task:' || new.task_id,
    'data', jsonb_build_object(
      'type',        'shared_task',
      'sharedTaskId', new.id,
      'taskId',      new.task_id,
      'ownerId',     new.owner_id,
      'circleId',    new.circle_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] shared task insert trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_shared_task_push_insert on public.shared_tasks;
create trigger trg_shared_task_push_insert
after insert on public.shared_tasks
for each row execute function public._on_shared_task_insert();

-- ─── 7. SHARED TASKS — accepted / declined ──────────────────────────────────────────────
create or replace function public._on_shared_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id   uuid;
  actor_name text;
  title_txt  text;
  body_txt   text;
begin
  if not (old.status = 'pending' and new.status in ('accepted', 'declined')) then
    return new;
  end if;

  -- For direct shares the recipient is the actor. For circle shares we don't know who
  -- accepted individually (circle_invitations-style per-user acceptance isn't modeled here),
  -- so we fall back to a generic message.
  actor_id := coalesce(new.recipient_id, new.owner_id);
  actor_name := public._display_name_for(actor_id);

  if new.status = 'accepted' then
    title_txt := 'Shared task accepted';
    body_txt  := actor_name || ' accepted your shared task';
  else
    title_txt := 'Shared task declined';
    body_txt  := actor_name || ' declined your shared task';
  end if;

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.owner_id),
    'title',            title_txt,
    'body',             body_txt,
    'category',         'shared_task',
    'collapseKey',      'shared_task_resp:' || new.task_id,
    'data', jsonb_build_object(
      'type',        'shared_task_response',
      'sharedTaskId', new.id,
      'taskId',      new.task_id,
      'status',      new.status,
      'recipientId', new.recipient_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] shared task status trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_shared_task_push_status on public.shared_tasks;
create trigger trg_shared_task_push_status
after update of status on public.shared_tasks
for each row execute function public._on_shared_task_status_change();

-- ─── 8. SHARED TASKS — recipient marked complete ─────────────────────────────────────────
create or replace function public._on_shared_task_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id   uuid;
  actor_name text;
begin
  if not (old.recipient_completed = false and new.recipient_completed = true) then
    return new;
  end if;

  actor_id   := coalesce(new.recipient_id, new.owner_id);
  actor_name := public._display_name_for(actor_id);

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.owner_id),
    'title',            'Shared task completed',
    'body',             actor_name || ' completed your shared task',
    'category',         'shared_task',
    'collapseKey',      'shared_task_done:' || new.task_id,
    'data', jsonb_build_object(
      'type',         'shared_task_completed',
      'sharedTaskId', new.id,
      'taskId',       new.task_id,
      'recipientId',  new.recipient_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] shared task completion trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_shared_task_push_complete on public.shared_tasks;
create trigger trg_shared_task_push_complete
after update of recipient_completed on public.shared_tasks
for each row execute function public._on_shared_task_completion();
