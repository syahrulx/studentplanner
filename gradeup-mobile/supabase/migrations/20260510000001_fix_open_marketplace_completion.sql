-- =============================================================================
-- Fix Open Marketplace completion bug
-- =============================================================================
-- Ensure that offers made on an 'open_service' automatically become 'open_listing'
-- so that completing one order doesn't close the entire marketplace listing.

-- Drop ALL existing overloads first to prevent ambiguous function calls.
DROP FUNCTION IF EXISTS public.make_service_offer(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.make_service_offer(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.make_service_offer(
  p_service_id uuid,
  p_amount numeric,
  p_message text DEFAULT NULL,
  p_offer_kind text DEFAULT NULL
)
RETURNS public.service_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.service_offers;
  v_svc public.community_posts;
  v_kind text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts
   WHERE id = p_service_id AND post_type = 'service';
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id = v_uid THEN RAISE EXCEPTION 'Cannot offer on your own service'; END IF;
  IF v_svc.service_status <> 'open' THEN RAISE EXCEPTION 'Service is no longer accepting offers'; END IF;
  IF v_svc.price_type = 'free' THEN RAISE EXCEPTION 'Free services do not accept monetary offers. Claim it directly.'; END IF;

  -- SMART DEFAULT: If the post is an 'open_service', the offer MUST be 'open_listing'
  -- regardless of what the client sends (to prevent accidental closing of marketplace).
  IF v_svc.service_negotiation_mode = 'open_service' THEN
    v_kind := 'open_listing';
  ELSE
    v_kind := COALESCE(NULLIF(TRIM(p_offer_kind), ''), 'exclusive');
  END IF;

  IF v_kind NOT IN ('exclusive', 'open_listing') THEN
    RAISE EXCEPTION 'Invalid offer kind';
  END IF;

  UPDATE public.service_offers
     SET amount = p_amount,
         message = p_message,
         offer_kind = v_kind,
         updated_at = now()
   WHERE service_id = p_service_id
     AND offerer_id = v_uid
     AND status = 'pending'
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    INSERT INTO public.service_offers (
      service_id, offerer_id, amount, currency, message, offer_kind
    )
    values (
      p_service_id,
      v_uid,
      p_amount,
      COALESCE(v_svc.currency, 'MYR'),
      p_message,
      v_kind
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END $$;

-- CLEANUP: Fix any existing offers on open services that were incorrectly marked as 'exclusive'
UPDATE public.service_offers o
   SET offer_kind = 'open_listing'
  FROM public.community_posts p
 WHERE o.service_id = p.id
   AND p.service_negotiation_mode = 'open_service'
   AND o.offer_kind = 'exclusive';

-- REVERT: Reopen any open services that were accidentally marked as 'completed'
UPDATE public.community_posts
   SET service_status = 'open',
       completed_at = NULL
 WHERE service_negotiation_mode = 'open_service'
   AND service_status = 'completed';
