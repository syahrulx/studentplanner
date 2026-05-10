-- =============================================================================
-- 20260510000000: Complete Service Notification Coverage
-- =============================================================================
-- Fixes 3 notification gaps:
-- Gap 3: No notification when a review is received
-- Gap 4: Chat notification for open listings (claimed_by is NULL)
-- Gap 5: Micro-contract offer cancellation has no notification

-- ============================================================================
-- Gap 3: Review Received Notification
-- When someone leaves a review, notify the reviewee.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._on_service_review_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reviewer_name text;
  v_svc record;
BEGIN
  reviewer_name := public._display_name_for(new.reviewer_id);
  SELECT * INTO v_svc FROM public.community_posts WHERE id = new.service_id;

  PERFORM public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.reviewee_id),
    'title',            'New review received',
    'body',             reviewer_name || ' left you a ' || new.rating || '-star review.',
    'category',         'service_review',
    'collapseKey',      'service_review:' || new.service_id::text,
    'data', jsonb_build_object(
      'type',      'service_review_received',
      'serviceId', new.service_id,
      'reviewerId', new.reviewer_id
    )
  ));
  RETURN new;
EXCEPTION
  WHEN others THEN
    RAISE WARNING '[community-push] service review insert trigger failed: %', sqlerrm;
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_review_push_insert ON public.service_reviews;
CREATE TRIGGER trg_service_review_push_insert
AFTER INSERT ON public.service_reviews
FOR EACH ROW EXECUTE FUNCTION public._on_service_review_insert();

-- ============================================================================
-- Gap 4: Chat Notification for Open Listings
-- When claimed_by is NULL (open listing), look up the other party
-- from service_offers instead.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._on_service_chat_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
  recipient_uuid uuid;
  svc public.community_posts;
BEGIN
  -- Skip system messages
  IF new.content LIKE '___SYSTEM_MSG___%' THEN
    RETURN new;
  END IF;

  SELECT * INTO svc FROM public.community_posts WHERE id = new.service_id;
  IF svc.id IS NULL THEN RETURN new; END IF;

  -- Standard exclusive flow: author <-> claimer
  IF svc.claimed_by IS NOT NULL THEN
    IF new.sender_id = svc.author_id THEN
      recipient_uuid := svc.claimed_by;
    ELSE
      recipient_uuid := svc.author_id;
    END IF;
  ELSE
    -- Open listing: no claimed_by. Determine the other party.
    -- If sender is the author, we need the offerer from the offer context.
    -- If sender is an offerer, notify the author.
    IF new.sender_id = svc.author_id THEN
      -- Author sending message — find the offerer from the most recent accepted offer
      SELECT o.offerer_id INTO recipient_uuid
        FROM public.service_offers o
       WHERE o.service_id = new.service_id
         AND o.offerer_id <> new.sender_id
         AND o.status IN ('accepted', 'submitted', 'completed')
       ORDER BY o.updated_at DESC
       LIMIT 1;
    ELSE
      -- Offerer sending message — notify author
      recipient_uuid := svc.author_id;
    END IF;
  END IF;

  IF recipient_uuid IS NULL OR recipient_uuid = new.sender_id THEN
    RETURN new;
  END IF;

  sender_name := public._display_name_for(new.sender_id);

  PERFORM public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(recipient_uuid),
    'title',            sender_name,
    'body',             LEFT(new.content, 120),
    'category',         'service_chat',
    'collapseKey',      'service_chat:' || new.service_id::text,
    'data', jsonb_build_object(
      'type',      'service_chat_message',
      'serviceId', new.service_id,
      'senderId',  new.sender_id
    )
  ));
  RETURN new;
EXCEPTION
  WHEN others THEN
    RAISE WARNING '[community-push] service chat trigger failed: %', sqlerrm;
    RETURN new;
END;
$$;

-- Trigger already exists, function is replaced in-place via CREATE OR REPLACE

-- ============================================================================
-- Gap 5: Micro-Contract Offer Cancellation Notification
-- Update _on_service_offer_status_change to also handle 'cancelled' status.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._on_service_offer_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_svc record;
  actor_name text;
  recipient_uuid uuid;
  title_txt text;
  body_txt text;
  v_type text;
BEGIN
  IF old.status = new.status THEN RETURN new; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = new.service_id;

  -- 1. Submitted
  IF new.status = 'submitted' THEN
    v_type := 'service_submitted';
    title_txt := 'Work submitted';
    IF v_svc.service_kind = 'request' THEN
      recipient_uuid := v_svc.author_id;
    ELSE
      recipient_uuid := new.offerer_id;
    END IF;
    actor_name := public._display_name_for(auth.uid());
    body_txt := actor_name || ' has submitted work for your review.';
  
  -- 2. Completed
  ELSIF new.status = 'completed' THEN
    v_type := 'service_completed';
    title_txt := 'Order completed!';
    IF v_svc.service_kind = 'request' THEN
      recipient_uuid := new.offerer_id;
    ELSE
      recipient_uuid := v_svc.author_id;
    END IF;
    actor_name := public._display_name_for(auth.uid());
    body_txt := actor_name || ' approved your work. Order completed!';

  -- 3. Cancelled
  ELSIF new.status = 'cancelled' THEN
    v_type := 'service_cancelled';
    title_txt := 'Order cancelled';
    -- Notify the other party (whoever didn't cancel)
    IF auth.uid() = v_svc.author_id THEN
      recipient_uuid := new.offerer_id;
    ELSE
      recipient_uuid := v_svc.author_id;
    END IF;
    actor_name := public._display_name_for(auth.uid());
    body_txt := actor_name || ' has cancelled the order.';

  ELSE
    RETURN new;
  END IF;

  IF recipient_uuid IS NOT NULL AND recipient_uuid <> auth.uid() THEN
    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            title_txt,
      'body',             body_txt,
      'category',         v_type,
      'collapseKey',      v_type || ':' || new.id::text,
      'data', jsonb_build_object('type', v_type, 'serviceId', v_svc.id, 'offerId', new.id)
    ));
  END IF;

  RETURN new;
END;
$$;

-- Trigger already exists, function is replaced in-place via CREATE OR REPLACE
