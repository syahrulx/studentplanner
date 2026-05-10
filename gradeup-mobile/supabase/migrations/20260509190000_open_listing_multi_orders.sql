-- =============================================================================
-- Open Listing Multi-Orders (Micro-Contracts)
-- =============================================================================
-- Extends service_offers to support independent delivery and completion flows.

-- 1. Extend service_offers table
ALTER TABLE public.service_offers 
  ADD COLUMN IF NOT EXISTS delivery_note text,
  ADD COLUMN IF NOT EXISTS delivery_attachments jsonb,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. Update status check constraint
ALTER TABLE public.service_offers DROP CONSTRAINT IF EXISTS service_offers_status_check;
ALTER TABLE public.service_offers ADD CONSTRAINT service_offers_status_check 
  CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'submitted', 'completed'));

-- 3. Update accept_service_offer to support open listings independently
CREATE OR REPLACE FUNCTION public.accept_service_offer(p_offer_id uuid)
RETURNS public.community_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_offer  public.service_offers;
  v_svc    public.community_posts;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN RAISE EXCEPTION 'Offer not found'; END IF;

  PERFORM public.sync_open_service_expiry(v_offer.service_id);

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
  IF v_offer.status <> 'pending' THEN RAISE EXCEPTION 'Offer is not pending'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = v_offer.service_id;
  IF v_svc.id IS NULL OR v_svc.post_type <> 'service' THEN
    RAISE EXCEPTION 'Service not found';
  END IF;
  
  IF v_svc.author_id <> v_uid THEN
    RAISE EXCEPTION 'Only the requester can accept offers';
  END IF;
  
  IF v_svc.service_status <> 'open' THEN
    RAISE EXCEPTION 'Service is no longer open';
  END IF;

  -- Mark winner.
  UPDATE public.service_offers
     SET status = 'accepted', updated_at = now()
   WHERE id = p_offer_id;

  -- If it is an open listing, DO NOT close the main service or reject other offers!
  IF v_offer.offer_kind = 'open_listing' THEN
    RETURN v_svc;
  END IF;

  -- Auto-reject all other pending offers for this exclusive service.
  UPDATE public.service_offers
     SET status = 'rejected', updated_at = now()
   WHERE service_id = v_offer.service_id
     AND id <> p_offer_id
     AND status = 'pending';

  -- Promote service to claimed at the agreed amount.
  UPDATE public.community_posts
     SET service_status = 'claimed',
         claimed_by     = v_offer.offerer_id,
         claimed_at     = now(),
         accepted_amount = v_offer.amount,
         updated_at     = now()
   WHERE id = v_offer.service_id
   RETURNING * INTO v_svc;

  RETURN v_svc;
END $$;

-- 4. New RPC: Submit Delivery for an Offer
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
  IF v_offer.status <> 'accepted' THEN RAISE EXCEPTION 'Offer is not accepted and ready for submission'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = v_offer.service_id;
  
  -- Who is doing the work?
  -- If request: the offerer is doing the work.
  -- If offer: the author is doing the work.
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

  RETURN v_offer;
END $$;

GRANT EXECUTE ON FUNCTION public.submit_service_offer_delivery(uuid, text, jsonb) TO authenticated;

-- 5. New RPC: Approve Delivery for an Offer
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
  -- If request: the author is the client.
  -- If offer: the offerer is the client.
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

  RETURN v_offer;
END $$;

GRANT EXECUTE ON FUNCTION public.approve_service_offer_delivery(uuid) TO authenticated;
