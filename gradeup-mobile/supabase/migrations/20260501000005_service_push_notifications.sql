-- =============================================================================
-- 20260501000005: Service Push Notifications
-- =============================================================================
-- Wires up service marketplace events to the existing public._send_community_push
-- helper. All triggers are AFTER INSERT/UPDATE and fail gracefully.

-- ---------------------------------------------------------------------------
-- 1. New Offer Trigger (AFTER INSERT ON service_offers)
-- ---------------------------------------------------------------------------
create or replace function public._on_service_offer_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  offerer_name text;
  author_id uuid;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  offerer_name := public._display_name_for(new.offerer_id);
  select p.author_id into author_id from public.community_posts p where p.id = new.service_id;

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(author_id),
    'title',            'New offer on your service',
    'body',             offerer_name || ' made an offer of ' || coalesce(new.currency, 'MYR') || ' ' || coalesce(new.amount::text, 'your asking price'),
    'category',         'service_offer',
    'collapseKey',      'service_offer:' || new.service_id::text,
    'data', jsonb_build_object(
      'type',      'service_offer_new',
      'offerId',   new.id,
      'serviceId', new.service_id,
      'offererId', new.offerer_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] service offer insert trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_service_offer_push_insert on public.service_offers;
create trigger trg_service_offer_push_insert
after insert on public.service_offers
for each row execute function public._on_service_offer_insert();

-- ---------------------------------------------------------------------------
-- 2. Offer Accepted Trigger (AFTER UPDATE ON service_offers)
-- ---------------------------------------------------------------------------
create or replace function public._on_service_offer_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
  author_uuid uuid;
begin
  if not (old.status = 'pending' and new.status = 'accepted') then
    return new;
  end if;

  select p.author_id into author_uuid from public.community_posts p where p.id = new.service_id;
  author_name := public._display_name_for(author_uuid);

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.offerer_id),
    'title',            'Offer accepted!',
    'body',             author_name || ' accepted your offer.',
    'category',         'service_offer',
    'collapseKey',      'service_offer_acc:' || new.service_id::text,
    'data', jsonb_build_object(
      'type',      'service_offer_accepted',
      'offerId',   new.id,
      'serviceId', new.service_id,
      'authorId',  author_uuid
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] service offer accepted trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_service_offer_push_accept on public.service_offers;
create trigger trg_service_offer_push_accept
after update of status on public.service_offers
for each row execute function public._on_service_offer_accepted();

-- ---------------------------------------------------------------------------
-- 3. Service Claimed/Completed Trigger (AFTER UPDATE ON community_posts)
-- ---------------------------------------------------------------------------
create or replace function public._on_service_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  recipient_uuid uuid;
  title_txt text;
  body_txt text;
begin
  -- 1. Direct Claim (open -> claimed, no accepted_amount)
  if old.service_status = 'open' and new.service_status = 'claimed' and new.accepted_amount is null then
    actor_name := public._display_name_for(new.claimed_by);
    recipient_uuid := new.author_id;
    title_txt := 'Service claimed';
    body_txt := actor_name || ' took your service.';
    
    perform public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            title_txt,
      'body',             body_txt,
      'category',         'service_claimed',
      'collapseKey',      'service_claimed:' || new.id::text,
      'data', jsonb_build_object(
        'type',      'service_claimed',
        'serviceId', new.id,
        'claimerId', new.claimed_by
      )
    ));
  end if;

  -- 2. Service Completed (claimed -> completed)
  if old.service_status = 'claimed' and new.service_status = 'completed' then
    -- The person who completed it is the Client. We want to notify the Freelancer.
    -- We can just notify both minus the person who actually clicked it, but since we don't have current_user easily,
    -- let's just notify the person who isn't the client.
    if new.service_kind = 'request' then
      -- Author is Client, Claimer is Freelancer. Notify Claimer.
      recipient_uuid := new.claimed_by;
      actor_name := public._display_name_for(new.author_id);
    else
      -- Offer: Claimer is Client, Author is Freelancer. Notify Author.
      recipient_uuid := new.author_id;
      actor_name := public._display_name_for(new.claimed_by);
    end if;

    title_txt := 'Service completed!';
    body_txt := actor_name || ' marked the service as completed. You can now leave a review.';

    perform public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            title_txt,
      'body',             body_txt,
      'category',         'service_completed',
      'collapseKey',      'service_completed:' || new.id::text,
      'data', jsonb_build_object(
        'type',      'service_completed',
        'serviceId', new.id
      )
    ));
  end if;

  return new;
exception
  when others then
    raise warning '[community-push] service status trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_service_status_push on public.community_posts;
create trigger trg_service_status_push
after update of service_status on public.community_posts
for each row execute function public._on_service_status_change();

-- ---------------------------------------------------------------------------
-- 4. Chat Message Trigger (AFTER INSERT ON service_chat_messages)
-- ---------------------------------------------------------------------------
create or replace function public._on_service_chat_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  recipient_uuid uuid;
  svc public.community_posts;
begin
  select * into svc from public.community_posts where id = new.service_id;
  
  if svc.id is null then return new; end if;

  if new.sender_id = svc.author_id then
    recipient_uuid := svc.claimed_by;
  else
    recipient_uuid := svc.author_id;
  end if;

  if recipient_uuid is null then return new; end if;

  sender_name := public._display_name_for(new.sender_id);

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(recipient_uuid),
    'title',            sender_name,
    'body',             new.content,
    'category',         'service_chat',
    'collapseKey',      'service_chat:' || new.service_id::text,
    'data', jsonb_build_object(
      'type',      'service_chat_message',
      'serviceId', new.service_id,
      'senderId',  new.sender_id
    )
  ));
  return new;
exception
  when others then
    raise warning '[community-push] service chat trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_service_chat_push_insert on public.service_chat_messages;
create trigger trg_service_chat_push_insert
after insert on public.service_chat_messages
for each row execute function public._on_service_chat_message_insert();
