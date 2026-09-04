-- ==============================================================================
-- 20260606000005_crowdsourced_calendars.sql
-- Description: Add crowdsourcing support to university_calendar_offers
-- ==============================================================================

-- 1. Add source column to track who added it
ALTER TABLE public.university_calendar_offers
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'crowdsourced'));

-- 2. Prevent exact duplicate semester entries for the same campus and dates.
-- Labels such as "Semester 1" are intentionally reusable in a later year.
DROP INDEX IF EXISTS public.university_calendar_offers_unique_sem;
CREATE UNIQUE INDEX IF NOT EXISTS university_calendar_offers_unique_sem
ON public.university_calendar_offers (
  university_id, 
  COALESCE(campus_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  lower(trim(semester_label)),
  start_date,
  end_date
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
          -- Profiles store the selected campus as text. Resolve the offer's
          -- campus UUID through public.campuses instead of referencing the
          -- nonexistent profiles.campus_id column.
          (
            university_calendar_offers.campus_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.campuses c
              WHERE c.id = university_calendar_offers.campus_id
                AND c.university_id = p.university_id
                AND lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) =
                    lower(regexp_replace(trim(coalesce(p.campus, '')), '\s+', ' ', 'g'))
            )
          )
          OR
          (
            university_calendar_offers.campus_id IS NULL
            AND (
              nullif(trim(coalesce(p.campus, '')), '') IS NULL
              OR trim(coalesce(p.campus, '')) = '-'
              OR NOT EXISTS (
                SELECT 1 FROM public.campuses c
                WHERE c.university_id = p.university_id
              )
            )
          )
        )
    )
  );
