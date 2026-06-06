-- ==============================================================================
-- 20260606000000_calendar_offers_campus_id.sql
-- Description: Add campus_id to university_calendar_offers so admins can 
--              target specific campuses for a calendar update.
-- ==============================================================================

-- 1. Add the column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'university_calendar_offers' 
      AND column_name = 'campus_id'
  ) THEN
    ALTER TABLE public.university_calendar_offers 
    ADD COLUMN campus_id uuid REFERENCES public.campuses(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Update the read policy so users only see the calendar if it's for their campus or if it's for all campuses (campus_id is null)
DROP POLICY IF EXISTS university_calendar_offers_read_own_university ON public.university_calendar_offers;

CREATE POLICY university_calendar_offers_read_own_university
  ON public.university_calendar_offers
  FOR SELECT
  TO authenticated
  USING (
    university_id <> 'uitm'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.university_id IS NOT NULL
        AND p.university_id = university_calendar_offers.university_id
        AND (
          university_calendar_offers.campus_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.campuses c
            WHERE c.id = university_calendar_offers.campus_id
              AND c.name = p.campus
          )
        )
    )
  );
