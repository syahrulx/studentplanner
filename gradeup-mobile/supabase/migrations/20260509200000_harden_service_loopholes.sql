-- =============================================================================
-- Hardening Service Loopholes (Micro-Contracts Sync & Security)
-- =============================================================================

-- 1. Extend service_offers to support cancellation
ALTER TABLE public.service_offers DROP CONSTRAINT IF EXISTS service_offers_status_check;
ALTER TABLE public.service_offers ADD CONSTRAINT service_offers_status_check 
  CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'submitted', 'completed', 'cancelled'));

-- 2. New RPC: Cancel Accepted Offer (Mutual/Direct)
CREATE OR REPLACE FUNCTION public.cancel_service_offer(p_offer_id uuid)
RETURNS public.service_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.service_offers;
  v_svc public.community_posts;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN RAISE EXCEPTION 'Offer not found'; END IF;
  
  SELECT * INTO v_svc FROM public.community_posts WHERE id = v_offer.service_id;

  -- Only parties involved can cancel
  IF v_uid <> v_offer.offerer_id AND v_uid <> v_svc.author_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.service_offers
     SET status = 'cancelled',
         updated_at = now()
   WHERE id = p_offer_id
   RETURNING * INTO v_offer;

  -- If exclusive, revert main post to open
  IF v_offer.offer_kind <> 'open_listing' THEN
    UPDATE public.community_posts
       SET service_status = 'open',
           claimed_by = NULL,
           claimed_at = NULL,
           accepted_amount = NULL,
           updated_at = now()
     WHERE id = v_offer.service_id;
  END IF;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (v_offer.service_id, v_uid, '___SYSTEM_MSG___:Contract cancelled.');

  RETURN v_offer;
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_service_offer(uuid) TO authenticated;

-- 3. Update submit_service_offer_delivery to sync main post
CREATE OR REPLACE FUNCTION public.submit_service_offer_delivery(
  p_offer_id uuid,
  p_delivery_note text,
  p_delivery_attachments jsonb
)
RETURNS public.service_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.service_offers;
  v_svc public.community_posts;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.status <> 'accepted' THEN 
    RAISE EXCEPTION 'Offer is not in a state for submission'; 
  END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = v_offer.service_id;
  
  -- Who is doing the work?
  IF v_svc.service_kind = 'request' AND v_offer.offerer_id <> v_uid THEN
    RAISE EXCEPTION 'Only the hired freelancer can submit work';
  END IF;
  IF v_svc.service_kind = 'offer' AND v_svc.author_id <> v_uid THEN
    RAISE EXCEPTION 'Only the service provider can submit work';
  END IF;

  UPDATE public.service_offers
     SET status = 'submitted',
         delivery_note = p_delivery_note,
         delivery_attachments = p_delivery_attachments,
         updated_at = now()
   WHERE id = p_offer_id
   RETURNING * INTO v_offer;

  -- Sync main post if exclusive
  IF v_offer.offer_kind <> 'open_listing' THEN
    UPDATE public.community_posts
       SET service_status = 'submitted',
           submitted_at = now(),
           updated_at = now()
     WHERE id = v_offer.service_id;
  END IF;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (v_offer.service_id, v_uid, '___SYSTEM_MSG___:Work has been delivered for this offer.');

  RETURN v_offer;
END $$;

-- 4. Update approve_service_offer_delivery to sync main post
CREATE OR REPLACE FUNCTION public.approve_service_offer_delivery(p_offer_id uuid)
RETURNS public.service_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.service_offers;
  v_svc public.community_posts;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.status <> 'submitted' THEN RAISE EXCEPTION 'Offer delivery has not been submitted'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = v_offer.service_id;
  
  -- Who is approving? The Client.
  IF v_svc.service_kind = 'request' AND v_svc.author_id <> v_uid THEN
    RAISE EXCEPTION 'Only the requester can approve the work';
  END IF;
  IF v_svc.service_kind = 'offer' AND v_offer.offerer_id <> v_uid THEN
    RAISE EXCEPTION 'Only the buyer can approve the work';
  END IF;

  UPDATE public.service_offers
     SET status = 'completed',
         completed_at = now(),
         updated_at = now()
   WHERE id = p_offer_id
   RETURNING * INTO v_offer;

  -- Sync main post if exclusive
  IF v_offer.offer_kind <> 'open_listing' THEN
    UPDATE public.community_posts
       SET service_status = 'completed',
           completed_at = now(),
           updated_at = now()
     WHERE id = v_offer.service_id;
  END IF;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (v_offer.service_id, v_uid, '___SYSTEM_MSG___:Work approved. Order completed.');

  RETURN v_offer;
END $$;

-- 5. Harden Review Policy to support Micro-Contracts
-- Allows review if the parties have ANY completed offer together on this service.
DROP POLICY IF EXISTS "User can create their own review" ON public.service_reviews;
CREATE POLICY "User can create their own review"
  ON public.service_reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = service_id
        AND (
          -- Path A: Main service is completed (Exclusive)
          p.service_status = 'completed'
          OR
          -- Path B: At least one specific offer between these users is completed (Micro-Contract)
          EXISTS (
            SELECT 1 FROM public.service_offers o
            WHERE o.service_id = p.id
              AND o.status = 'completed'
              AND (
                (p.author_id = reviewer_id AND o.offerer_id = reviewee_id)
                OR
                (o.offerer_id = reviewer_id AND p.author_id = reviewee_id)
              )
          )
        )
    )
  );

-- 6. Add Trigger for Micro-Contract Notifications
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
    title_txt := 'Service completed!';
    IF v_svc.service_kind = 'request' THEN
      recipient_uuid := new.offerer_id;
    ELSE
      recipient_uuid := v_svc.author_id;
    END IF;
    actor_name := public._display_name_for(auth.uid());
    body_txt := actor_name || ' approved your work. Order completed!';

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

DROP TRIGGER IF EXISTS tr_on_service_offer_status_change ON public.service_offers;
CREATE TRIGGER tr_on_service_offer_status_change
  AFTER UPDATE OF status ON public.service_offers
  FOR EACH ROW EXECUTE FUNCTION public._on_service_offer_status_change();
