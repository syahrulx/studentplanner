-- ==============================================================================
-- 20260826000000_calendar_offer_date_order.sql
-- Description: Reject calendar offers whose semester ends before it starts.
--
-- Nothing enforced date order on university_calendar_offers, and five published
-- rows had an end_date earlier than their start_date — including one typed as
-- year 1026 instead of 2026, which read as a semester ending 365,168 days ago.
-- The mobile submit screen checks this, but the admin path did not, so anything
-- could be published to every student at a university.
-- ==============================================================================

-- 1. Remove the impossible rows. They cannot be repaired without knowing what
--    the real dates were, and each one is superseded by a valid offer for the
--    same university.
DELETE FROM public.university_calendar_offers
WHERE end_date < start_date;

-- 2. Enforce it from here on.
ALTER TABLE public.university_calendar_offers
DROP CONSTRAINT IF EXISTS university_calendar_offers_date_order;

ALTER TABLE public.university_calendar_offers
ADD CONSTRAINT university_calendar_offers_date_order
CHECK (end_date >= start_date);
