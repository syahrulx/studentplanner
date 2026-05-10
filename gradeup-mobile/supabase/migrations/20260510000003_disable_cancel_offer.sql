-- =============================================================================
-- Disable cancelling accepted service offers
-- =============================================================================
-- The user requested that after an offer is accepted, neither the service 
-- provider nor the customer can cancel the order.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_service_offer(p_offer_id uuid)
RETURNS public.service_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Orders cannot be cancelled after they are accepted.';
END $$;
