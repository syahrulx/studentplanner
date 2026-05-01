-- =============================================================================
-- 20260501000006: Event Push Notifications
-- =============================================================================
-- Wires up community events and memos to the existing public._send_community_push
-- helper. 

-- ---------------------------------------------------------------------------
-- 1. New Event/Memo Trigger (AFTER INSERT ON community_posts)
-- ---------------------------------------------------------------------------
create or replace function public._on_event_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipients uuid[];
  author_name text;
  title_txt text;
  body_txt text;
begin
  if new.post_type not in ('event', 'memo') then
    return new;
  end if;

  author_name := public._display_name_for(new.author_id);

  if new.post_type = 'event' then
    title_txt := 'New Event';
    body_txt := author_name || ' posted an event: ' || new.title;
  else
    title_txt := 'New Announcement';
    body_txt := author_name || ' posted an announcement: ' || new.title;
  end if;

  -- Notify users in the same university.
  if new.university_id is not null then
    select array_agg(id) into recipients
    from public.profiles
    where university_id = new.university_id
      and id <> new.author_id;
  else
    -- If no university is specified, broadcast to everyone (or cap it if it gets too large)
    select array_agg(id) into recipients
    from public.profiles
    where id <> new.author_id;
  end if;

  if recipients is null or array_length(recipients, 1) = 0 then
    return new;
  end if;

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', to_jsonb(recipients),
    'title',            title_txt,
    'body',             body_txt,
    'category',         'event',
    'collapseKey',      'event_new:' || new.id::text,
    'data', jsonb_build_object(
      'type',      'event_new',
      'eventId',   new.id,
      'postType',  new.post_type,
      'authorId',  new.author_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] event insert trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_event_push_insert on public.community_posts;
create trigger trg_event_push_insert
after insert on public.community_posts
for each row execute function public._on_event_insert();
