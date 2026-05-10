-- =============================================================================
-- Fix chat access for accepted/submitted offers (not just pending open_listing)
-- =============================================================================
-- After an offer is accepted, the chat must remain accessible for both parties
-- to coordinate delivery. Previously the DB layer blocked chat creation/sending
-- once the offer status left 'pending'.
-- =============================================================================

-- 1. Fix the RPC: allow creating threads for any active offer status
CREATE OR REPLACE FUNCTION public.ensure_open_offer_dm_thread(p_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.service_offers;
  v_svc public.community_posts;
  v_thread_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  SELECT * INTO v_svc FROM public.community_posts
   WHERE id = v_offer.service_id AND post_type = 'service';
  IF v_svc.id IS NULL THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  -- Return existing thread if one exists
  SELECT id INTO v_thread_id
    FROM public.service_offer_dm_threads
   WHERE offer_id = p_offer_id;

  IF v_thread_id IS NOT NULL THEN
    IF v_uid NOT IN (v_svc.author_id, v_offer.offerer_id) THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
    RETURN v_thread_id;
  END IF;

  -- Only create new thread if the offer is still active
  IF v_offer.status NOT IN ('pending', 'accepted', 'submitted') THEN
    RAISE EXCEPTION 'This offer is no longer active';
  END IF;

  IF v_uid NOT IN (v_svc.author_id, v_offer.offerer_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.service_offer_dm_threads (offer_id)
  VALUES (p_offer_id)
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

-- 2. Fix the INSERT policy: allow sending messages for any active offer
DROP POLICY IF EXISTS "offer_dm_messages_insert" ON public.service_offer_dm_messages;

CREATE POLICY "offer_dm_messages_insert"
  ON public.service_offer_dm_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.user_can_access_offer_dm_thread(thread_id)
    AND EXISTS (
      SELECT 1
      FROM public.service_offer_dm_threads t
      INNER JOIN public.service_offers o ON o.id = t.offer_id
      WHERE t.id = thread_id
        AND o.status IN ('pending', 'accepted', 'submitted')
    )
  );
