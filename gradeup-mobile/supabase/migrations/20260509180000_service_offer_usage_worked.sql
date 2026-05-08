-- =============================================================================
-- Open listing feedback: thumbs up / thumbs down per user per offer
-- =============================================================================
-- Adds service_offer_usages.worked (default true for existing rows).
-- record_service_offer_use(p_offer_id, p_worked) upserts the viewer's vote.

ALTER TABLE public.service_offer_usages
  ADD COLUMN IF NOT EXISTS worked boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.service_offer_usages.worked IS
  'true = worked for me (like), false = did not work (dislike). One row per (offer, user).';

DROP FUNCTION IF EXISTS public.record_service_offer_use(uuid);
DROP FUNCTION IF EXISTS public.record_service_offer_use(uuid, boolean);

CREATE OR REPLACE FUNCTION public.record_service_offer_use(
  p_offer_id uuid,
  p_worked boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.service_offers;
  v_svc public.community_posts;
  v_pos bigint;
  v_neg bigint;
  v_ins boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN RAISE EXCEPTION 'Offer not found'; END IF;

  PERFORM public.sync_open_service_expiry(v_offer.service_id);

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
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

  v_ins := NOT EXISTS (
    SELECT 1 FROM public.service_offer_usages u
    WHERE u.offer_id = p_offer_id AND u.user_id = v_uid
  );

  INSERT INTO public.service_offer_usages (offer_id, user_id, worked)
  VALUES (p_offer_id, v_uid, p_worked)
  ON CONFLICT (offer_id, user_id) DO UPDATE
  SET worked = EXCLUDED.worked;

  SELECT
    coalesce(count(*) FILTER (WHERE worked), 0)::bigint,
    coalesce(count(*) FILTER (WHERE NOT worked), 0)::bigint
  INTO v_pos, v_neg
  FROM public.service_offer_usages
  WHERE offer_id = p_offer_id;

  RETURN jsonb_build_object(
    'positive_count', v_pos,
    'negative_count', v_neg,
    'newly_recorded', v_ins
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_service_offer_use(uuid, boolean) TO authenticated;
