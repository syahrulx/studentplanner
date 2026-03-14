-- ============================================================
-- ACADEMIC PROFILE & CALENDAR – SOW intelligence per user
-- ============================================================
-- Profiles: academic_level (Diploma/Bachelor/Master/PhD etc.)
-- Academic calendar: semester start/end, total weeks, breaks
-- ============================================================

-- Add academic_level to profiles (university already exists from sign-up)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS academic_level text;

-- Optional: ensure start_date for semester is stored per user (can use academic_calendar instead)
-- We use academic_calendar for semester bounds; profile.academic_level for level.

-- Academic calendar: one active semester per user (e.g. Mar 2026 – Jun 2026, 14 weeks)
CREATE TABLE IF NOT EXISTS public.academic_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semester_label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_weeks integer NOT NULL DEFAULT 14,
  break_start_date date,
  break_end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

COMMENT ON TABLE public.academic_calendar IS 'One row per user: active semester dates for SOW alignment and week calculation.';

CREATE INDEX IF NOT EXISTS idx_academic_calendar_user_id ON public.academic_calendar(user_id);

ALTER TABLE public.academic_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own academic calendar" ON public.academic_calendar;
CREATE POLICY "Users can view own academic calendar"
  ON public.academic_calendar FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own academic calendar" ON public.academic_calendar;
CREATE POLICY "Users can insert own academic calendar"
  ON public.academic_calendar FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own academic calendar" ON public.academic_calendar;
CREATE POLICY "Users can update own academic calendar"
  ON public.academic_calendar FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own academic calendar" ON public.academic_calendar;
CREATE POLICY "Users can delete own academic calendar"
  ON public.academic_calendar FOR DELETE
  USING (auth.uid() = user_id);
