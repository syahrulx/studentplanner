-- =============================================================================
-- record_service_offer_use: allow post author + listing owner to leave feedback
-- =============================================================================
-- Prior migrations blocked the offer-post author and the offer row creator.
-- Product: any participant (tutor, student who listed their rate, or peers) may
-- confirm “it worked” once per offer for trust — still one row per (offer, user).

CREATE OR REPLACE FUNCTION public.record_service_offer_use(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.service_offers;
  v_svc public.community_posts;
  v_cnt bigint;
  v_ins uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.status <> 'pending' THEN RAISE EXCEPTION 'Offer is no longer active'; END IF;
  IF v_offer.offer_kind <> 'open_listing' THEN
    RAISE EXCEPTION 'Only open listing offers support this action';
  END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = v_offer.service_id;
  IF v_svc.id IS NULL OR v_svc.post_type <> 'service' THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  IF v_svc.service_status <> 'open' THEN
    RAISE EXCEPTION 'This service is no longer open';
  END IF;

  v_ins := NULL;
  INSERT INTO public.service_offer_usages (offer_id, user_id)
  VALUES (p_offer_id, v_uid)
  ON CONFLICT (offer_id, user_id) DO NOTHING
  RETURNING offer_id INTO v_ins;

  SELECT count(*)::bigint INTO v_cnt FROM public.service_offer_usages WHERE offer_id = p_offer_id;

  RETURN jsonb_build_object(
    'usage_count', v_cnt,
    'newly_recorded', v_ins IS NOT NULL
  );
END;
$$;
