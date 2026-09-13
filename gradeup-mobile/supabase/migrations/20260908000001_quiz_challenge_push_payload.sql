-- Quiz challenges ride on `quick_reactions`, so the generic reaction trigger built
-- their push. Three things went wrong as a result:
--
--   1. The emoji CASE has no arm for '🎮', so the title fell through to
--      "<sender> ✨" instead of reading as a quiz challenge.
--   2. The payload carried `data.type = 'reaction'`, which the app routes to the
--      notification list. The 'quiz_invite' branch that opens /match-lobby
--      (app/_layout.tsx) was therefore never reachable from a challenge.
--   3. `collapseKey` was 'reaction:<sender_id>', so a second challenge from the
--      same friend replaced the first banner even though it is a different match.
--
-- The row had nowhere to put a session id, so add a small sender-supplied jsonb
-- payload and let the trigger forward it. Reactions that are not quiz challenges,
-- and quiz challenges from older clients that send no session id, keep their
-- previous behaviour exactly.

alter table public.quick_reactions
  add column if not exists data jsonb;

comment on column public.quick_reactions.data is
  'Optional sender-supplied payload forwarded into the push data for typed reactions, '
  'e.g. {"sessionId": "...", "inviteCode": "..."} on a quiz challenge.';

create or replace function public._on_quick_reaction_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name      text;
  emoji            text;
  title_txt        text;
  body_txt         text;
  quiz_session_id  text;
  quiz_invite_code text;
begin
  sender_name := public._display_name_for(new.sender_id);

  quiz_session_id  := nullif(trim(coalesce(new.data->>'sessionId', '')), '');
  quiz_invite_code := nullif(trim(coalesce(new.data->>'inviteCode', '')), '');

  -- Quiz challenge with a known session: its own title, category, collapse key
  -- and a tappable destination.
  if new.reaction_type = '🎮' and quiz_session_id is not null then
    perform public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(new.receiver_id),
      'title',            sender_name || ' 🎮',
      'body',             coalesce(nullif(new.message, ''), 'Challenged you to a quiz'),
      'category',         'quiz',
      'collapseKey',      'quiz:' || quiz_session_id,
      'data', jsonb_build_object(
        'type',       'quiz_invite',
        'reactionId', new.id,
        'senderId',   new.sender_id,
        'sessionId',  quiz_session_id,
        'inviteCode', quiz_invite_code
      )
    ));
    return new;
  end if;

  emoji := case new.reaction_type
    when 'clap'   then '👏'
    when 'fire'   then '🔥'
    when 'heart'  then '❤️'
    when 'muscle' then '💪'
    when 'star'   then '⭐'
    when 'bump'   then '👋'
    when '🎮'     then '🎮'
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
