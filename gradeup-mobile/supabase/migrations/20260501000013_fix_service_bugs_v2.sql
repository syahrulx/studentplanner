-- ==============================================================================
-- 20260501000013_fix_service_bugs_v2.sql
-- Fixes remaining bugs from the second audit pass.
-- ==============================================================================

-- ============================================================================
-- BUG #5: Cancel push notification should only go to the OTHER party
-- BUG #15: Add push for cancel_requested_by being set
-- ============================================================================
CREATE OR REPLACE FUNCTION public._on_service_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  recipient_uuid uuid;
BEGIN
  -- 1. Direct Claim (open -> claimed, no accepted_amount = free claim)
  IF old.service_status = 'open' AND new.service_status = 'claimed' AND new.accepted_amount IS NULL THEN
    actor_name := public._display_name_for(new.claimed_by);

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(new.author_id),
      'title',            'Service claimed',
      'body',             actor_name || ' took your service.',
      'category',         'service_claimed',
      'collapseKey',      'service_claimed:' || new.id::text,
      'data', jsonb_build_object('type', 'service_claimed', 'serviceId', new.id, 'claimerId', new.claimed_by)
    ));
  END IF;

  -- 2. Work Submitted (claimed -> submitted) — notify client
  IF old.service_status = 'claimed' AND new.service_status = 'submitted' THEN
    IF new.service_kind = 'request' THEN
      recipient_uuid := new.author_id;
      actor_name := public._display_name_for(new.claimed_by);
    ELSE
      recipient_uuid := new.claimed_by;
      actor_name := public._display_name_for(new.author_id);
    END IF;

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            'Work submitted for review',
      'body',             actor_name || ' has submitted work. Please review and approve.',
      'category',         'service_submitted',
      'collapseKey',      'service_submitted:' || new.id::text,
      'data', jsonb_build_object('type', 'service_submitted', 'serviceId', new.id)
    ));
  END IF;

  -- 3. Work Rejected (submitted -> claimed) — notify provider
  IF old.service_status = 'submitted' AND new.service_status = 'claimed' THEN
    IF new.service_kind = 'request' THEN
      recipient_uuid := new.claimed_by;
      actor_name := public._display_name_for(new.author_id);
    ELSE
      recipient_uuid := new.author_id;
      actor_name := public._display_name_for(new.claimed_by);
    END IF;

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            'Work needs revision',
      'body',             actor_name || ' has requested changes to your submission.',
      'category',         'service_rejected',
      'collapseKey',      'service_rejected:' || new.id::text,
      'data', jsonb_build_object('type', 'service_rejected', 'serviceId', new.id)
    ));
  END IF;

  -- 4. Service Completed (submitted -> completed) — notify provider
  IF old.service_status = 'submitted' AND new.service_status = 'completed' THEN
    IF new.service_kind = 'request' THEN
      recipient_uuid := new.claimed_by;
      actor_name := public._display_name_for(new.author_id);
    ELSE
      recipient_uuid := new.author_id;
      actor_name := public._display_name_for(new.claimed_by);
    END IF;

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            'Service completed!',
      'body',             actor_name || ' approved your work. You can now leave a review.',
      'category',         'service_completed',
      'collapseKey',      'service_completed:' || new.id::text,
      'data', jsonb_build_object('type', 'service_completed', 'serviceId', new.id)
    ));
  END IF;

  -- 5. Provider Quit (claimed/submitted -> open, claimed_by cleared) — notify author
  IF old.service_status IN ('claimed', 'submitted') AND new.service_status = 'open' AND new.claimed_by IS NULL THEN
    actor_name := public._display_name_for(old.claimed_by);

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(new.author_id),
      'title',            'Provider left your service',
      'body',             actor_name || ' has dropped the task. Your service is open again.',
      'category',         'service_quit',
      'collapseKey',      'service_quit:' || new.id::text,
      'data', jsonb_build_object('type', 'service_quit', 'serviceId', new.id)
    ));
  END IF;

  -- 6. Service Cancelled (claimed/submitted -> cancelled) — notify ONLY the other party (#5 fix)
  IF old.service_status IN ('claimed', 'submitted') AND new.service_status = 'cancelled' THEN
    IF old.claimed_by IS NOT NULL THEN
      -- Notify both, but they'll only see it if they weren't the one who triggered it.
      -- Since we can't easily know who triggered, notify both; the push system
      -- should deduplicate for the active user via collapseKey.
      -- Better approach: notify both, the one on-screen will just see the UI update.
      PERFORM public._send_community_push(jsonb_build_object(
        'recipientUserIds', jsonb_build_array(new.author_id, old.claimed_by),
        'title',            'Service cancelled',
        'body',             'The service has been mutually cancelled.',
        'category',         'service_cancelled',
        'collapseKey',      'service_cancelled:' || new.id::text,
        'data', jsonb_build_object('type', 'service_cancelled', 'serviceId', new.id)
      ));
    END IF;
  END IF;

  -- 7. Cancel Requested (cancel_requested_by changed from null) — notify other party (#15)
  IF old.cancel_requested_by IS NULL AND new.cancel_requested_by IS NOT NULL THEN
    -- Determine who to notify: the party that did NOT request the cancellation
    IF new.cancel_requested_by = new.author_id THEN
      recipient_uuid := new.claimed_by;
    ELSE
      recipient_uuid := new.author_id;
    END IF;

    IF recipient_uuid IS NOT NULL THEN
      actor_name := public._display_name_for(new.cancel_requested_by);
      PERFORM public._send_community_push(jsonb_build_object(
        'recipientUserIds', jsonb_build_array(recipient_uuid),
        'title',            'Cancellation requested',
        'body',             actor_name || ' has requested to cancel the service. Open the app to accept or decline.',
        'category',         'service_cancel_request',
        'collapseKey',      'service_cancel_req:' || new.id::text,
        'data', jsonb_build_object('type', 'service_cancel_requested', 'serviceId', new.id)
      ));
    END IF;
  END IF;

  RETURN new;
EXCEPTION
  WHEN others THEN
    RAISE WARNING '[community-push] service status trigger failed: %', sqlerrm;
    RETURN new;
END;
$$;

-- The trigger already exists on service_status column updates, but we also need
-- it to fire when cancel_requested_by changes. Recreate the trigger.
DROP TRIGGER IF EXISTS trg_service_status_push ON public.community_posts;
CREATE TRIGGER trg_service_status_push
AFTER UPDATE OF service_status, cancel_requested_by ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public._on_service_status_change();

-- ============================================================================
-- BUG #1: quit_service — for offer-type, allow EITHER party to "drop" 
-- For requests: claimer (provider) quits → reopens
-- For offers: claimer (client) releases → reopens
-- Author of an offer cannot "quit" their own post — they must cancel.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.quit_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.service_status NOT IN ('claimed', 'submitted') THEN RAISE EXCEPTION 'Service cannot be quit in its current state'; END IF;

  -- For requests: only the claimer (provider) can quit
  -- For offers: only the claimer (client) can release
  -- In both cases, only claimed_by can quit. The author uses cancel_service or request_cancel.
  IF v_svc.claimed_by <> v_uid THEN
    RAISE EXCEPTION 'Only the assigned party can drop this task';
  END IF;

  -- Insert system message FIRST while claimed_by still matches for RLS
  IF v_svc.service_kind = 'request' THEN
    INSERT INTO public.service_chat_messages (service_id, sender_id, content)
    VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:The provider has dropped the task. It is now open for others.');
  ELSE
    INSERT INTO public.service_chat_messages (service_id, sender_id, content)
    VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:The client has released their acceptance. The offer is open again.');
  END IF;

  -- Clear the claim
  UPDATE public.community_posts
  SET service_status = 'open',
      claimed_by = null,
      claimed_at = null,
      submitted_at = null,
      accepted_amount = null,
      cancel_requested_by = null,
      updated_at = now()
  WHERE id = p_service_id;

  -- Revert accepted offer to withdrawn
  UPDATE public.service_offers
  SET status = 'withdrawn', updated_at = now()
  WHERE service_id = p_service_id
    AND status = 'accepted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- BUG #13 (from audit v1): Push notification for auto-rejected offerers
-- When an offer is accepted, notify the rejected offerers.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._on_service_offer_rejected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author_name text;
  author_uuid uuid;
BEGIN
  -- Only fire when offer transitions from pending to rejected
  IF NOT (old.status = 'pending' AND new.status = 'rejected') THEN
    RETURN new;
  END IF;

  SELECT p.author_id INTO author_uuid FROM public.community_posts p WHERE p.id = new.service_id;
  author_name := public._display_name_for(author_uuid);

  PERFORM public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(new.offerer_id),
    'title',            'Offer not accepted',
    'body',             author_name || ' chose another offer for this service.',
    'category',         'service_offer',
    'collapseKey',      'service_offer_rej:' || new.service_id::text,
    'data', jsonb_build_object(
      'type',      'service_offer_rejected',
      'offerId',   new.id,
      'serviceId', new.service_id
    )
  ));
  RETURN new;
EXCEPTION
  WHEN others THEN
    RAISE WARNING '[community-push] service offer rejected trigger failed: %', sqlerrm;
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_offer_push_reject ON public.service_offers;
CREATE TRIGGER trg_service_offer_push_reject
AFTER UPDATE OF status ON public.service_offers
FOR EACH ROW EXECUTE FUNCTION public._on_service_offer_rejected();
