-- ==============================================================================
-- 20260606000006_crowdsourced_reports.sql
-- Description: Add report tracking to crowdsourced calendars
-- ==============================================================================

-- 1. Add report_count column
ALTER TABLE public.university_calendar_offers
ADD COLUMN IF NOT EXISTS report_count INT NOT NULL DEFAULT 0;

-- 2. Create function to increment report safely
CREATE OR REPLACE FUNCTION public.increment_calendar_report(offer_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as the database owner so it bypasses RLS
SET search_path = public
AS $$
BEGIN
  -- We only allow incrementing crowdsourced calendars
  UPDATE public.university_calendar_offers
  SET report_count = report_count + 1
  WHERE id = offer_id AND source = 'crowdsourced';
END;
$$;
