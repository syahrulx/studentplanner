-- ==============================================================================
-- 20260826000002_calendar_offers_program_level.sql
-- Description: Record which programme a published calendar belongs to.
--
-- One university commonly publishes several calendars with completely different
-- dates — UKM's ASASIpintar semester ran June to November 2026 while the
-- undergraduate one ran September to February. Both were stored as
-- "Semester 1 2026/2027" because the table had nowhere to record the programme,
-- so students had no way to tell which was theirs and picked the wrong one.
--
-- The extraction already returns `program_level`, `campus_group` and
-- `campus_group_description` per candidate; those values were simply dropped on
-- the way in. Storing the programme lets the picker default to calendars that
-- match the student's own `profiles.academic_level`.
-- ==============================================================================

ALTER TABLE public.university_calendar_offers
ADD COLUMN IF NOT EXISTS program_level text;

COMMENT ON COLUMN public.university_calendar_offers.program_level IS
  'Programme this calendar applies to (Foundation, Diploma, Bachelor, Master, PhD), or NULL when it applies to every programme.';

CREATE INDEX IF NOT EXISTS university_calendar_offers_program_level_idx
ON public.university_calendar_offers (university_id, program_level);
