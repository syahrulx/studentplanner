-- ==============================================================================
-- 20260606000005_crowdsourced_calendars.sql
-- Description: Add crowdsourcing support to university_calendar_offers
-- ==============================================================================

-- 1. Add source column to track who added it
ALTER TABLE public.university_calendar_offers
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'crowdsourced'));

-- 2. Add Unique constraint to prevent duplicate semester entries for the same campus
CREATE UNIQUE INDEX IF NOT EXISTS university_calendar_offers_unique_sem
ON public.university_calendar_offers (
  university_id, 
  COALESCE(campus_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  lower(trim(semester_label))
);

-- 3. Allow regular users to INSERT into this table for their own university/campus
DROP POLICY IF EXISTS university_calendar_offers_insert_own ON public.university_calendar_offers;

CREATE POLICY university_calendar_offers_insert_own
  ON public.university_calendar_offers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND source = 'crowdsourced'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.university_id = university_calendar_offers.university_id
        AND (
          -- They must match the campus precisely
          p.campus_id = university_calendar_offers.campus_id
          OR
          -- Fallback for legacy campus text field
          (
            p.campus_id IS NULL AND EXISTS (
              SELECT 1 FROM public.campuses c
              WHERE c.id = university_calendar_offers.campus_id
                AND c.name = p.campus
            )
          )
        )
    )
  );
