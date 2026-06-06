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
