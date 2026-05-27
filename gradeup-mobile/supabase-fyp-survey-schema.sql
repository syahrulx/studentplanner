-- =============================================================================
-- FYP Survey Schema for Rencana Mobile
-- Run this in Supabase SQL Editor AFTER community schema is set up.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. EXTEND community_posts WITH SURVEY FIELDS
-- ---------------------------------------------------------------------------

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS survey_url           TEXT,
  ADD COLUMN IF NOT EXISTS survey_quota         INT  NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS survey_respond_count INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS survey_course        TEXT,
  ADD COLUMN IF NOT EXISTS survey_topic         TEXT;

-- ---------------------------------------------------------------------------
-- 2. SURVEY RESPONSES TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id      UUID        NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  respondent_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  responded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  proof_url      TEXT        NOT NULL,      -- REQUIRED: screenshot of completed survey
  UNIQUE(survey_id, respondent_id)         -- one response per user enforced at DB level
);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to be idempotent
DROP POLICY IF EXISTS "Users can read own survey responses" ON public.survey_responses;
DROP POLICY IF EXISTS "Users can insert own survey responses" ON public.survey_responses;

-- Respondents can see their own responses only
CREATE POLICY "Users can read own survey responses"
  ON public.survey_responses FOR SELECT
  USING (auth.uid() = respondent_id);

-- Survey authors can see who responded (for their own survey)
CREATE POLICY "Survey authors can read responses"
  ON public.survey_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts
      WHERE id = survey_responses.survey_id
        AND author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. HELPER FUNCTION: can_respond_to_survey()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_respond_to_survey(p_survey_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Survey must exist, be open, and not be authored by the current user
    EXISTS (
      SELECT 1 FROM public.community_posts
      WHERE id = p_survey_id
        AND post_type = 'service'
        AND service_category = 'fyp_survey'
        AND author_id <> auth.uid()
        AND service_status = 'open'
        AND survey_respond_count < survey_quota
    )
    -- User must not have already responded
    AND NOT EXISTS (
      SELECT 1 FROM public.survey_responses
      WHERE survey_id = p_survey_id
        AND respondent_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.can_respond_to_survey(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.can_respond_to_survey(UUID) TO authenticated;

-- Users can mark themselves as having responded — with anti-gaming guards:
-- 1. They cannot respond to their own survey
-- 2. The survey must be open
-- 3. The quota must not be exceeded
CREATE POLICY "Users can insert own survey responses"
  ON public.survey_responses FOR INSERT
  WITH CHECK (
    auth.uid() = respondent_id
    AND public.can_respond_to_survey(survey_id)
  );

-- Responses are immutable — no updates/deletes allowed
-- (No DELETE or UPDATE policies intentionally)

-- ---------------------------------------------------------------------------
-- 3B. RECIPROCITY GATE: can_post_survey()
--
--  Bootstrap mode: if the total number of open FYP surveys is below
--  SURVEY_BOOTSTRAP_THRESHOLD (10), ANYONE can post freely.
--  This prevents the chicken-and-egg deadlock at launch.
--
--  Once the pool grows past the threshold, users must have responded to
--  at least SURVEY_RECIPROCITY_MIN (2) surveys before posting their own.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_post_survey()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Bootstrap mode: pool is still small, gate is disabled
    (
      SELECT COUNT(*)
      FROM public.community_posts
      WHERE service_category = 'fyp_survey'
        AND service_status = 'open'
    ) < 10   -- SURVEY_BOOTSTRAP_THRESHOLD
    OR
    -- Gate active: user has responded to >= 2 surveys
    (
      SELECT COUNT(*)
      FROM public.survey_responses
      WHERE respondent_id = auth.uid()
    ) >= 2;  -- SURVEY_RECIPROCITY_MIN
$$;

REVOKE ALL ON FUNCTION public.can_post_survey() FROM public;
GRANT EXECUTE ON FUNCTION public.can_post_survey() TO authenticated;

-- Returns total number of currently open surveys (used by the UI to detect bootstrap mode)
CREATE OR REPLACE FUNCTION public.get_survey_pool_size()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.community_posts
  WHERE service_category = 'fyp_survey'
    AND service_status = 'open';
$$;

REVOKE ALL ON FUNCTION public.get_survey_pool_size() FROM public;
GRANT EXECUTE ON FUNCTION public.get_survey_pool_size() TO authenticated;

-- Helper: returns how many surveys the current user has responded to
-- (used by the UI to show the "X/3 surveys responded" progress bar)
CREATE OR REPLACE FUNCTION public.get_survey_response_count_for_me()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.survey_responses
  WHERE respondent_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_survey_response_count_for_me() FROM public;
GRANT EXECUTE ON FUNCTION public.get_survey_response_count_for_me() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. TRIGGER: Auto-increment respond_count and close survey at quota
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.after_survey_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.community_posts
  SET
    survey_respond_count = survey_respond_count + 1,
    -- Auto-close when quota is reached
    service_status = CASE
      WHEN survey_respond_count + 1 >= survey_quota THEN 'completed'
      ELSE service_status
    END,
    completed_at = CASE
      WHEN survey_respond_count + 1 >= survey_quota THEN now()
      ELSE completed_at
    END,
    updated_at = now()
  WHERE id = NEW.survey_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_survey_response ON public.survey_responses;
CREATE TRIGGER trg_after_survey_response
  AFTER INSERT ON public.survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.after_survey_response();

-- ---------------------------------------------------------------------------
-- 5. RPC: record_survey_response — safe upsert called from the app
--    proof_url is REQUIRED: the app must upload the screenshot first.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_survey_response(
  p_survey_id UUID,
  p_proof_url  TEXT       -- REQUIRED, NOT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_already_responded BOOLEAN;
  v_can_respond       BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Proof is mandatory
  IF p_proof_url IS NULL OR trim(p_proof_url) = '' THEN
    RETURN jsonb_build_object('error', 'A screenshot proof is required to record your response.');
  END IF;

  -- Check if already responded
  SELECT EXISTS (
    SELECT 1 FROM public.survey_responses
    WHERE survey_id = p_survey_id AND respondent_id = v_user_id
  ) INTO v_already_responded;

  IF v_already_responded THEN
    RETURN jsonb_build_object('status', 'already_responded');
  END IF;

  -- Check eligibility (open, not own survey, quota not reached)
  SELECT public.can_respond_to_survey(p_survey_id) INTO v_can_respond;

  IF NOT v_can_respond THEN
    RETURN jsonb_build_object('error', 'Cannot respond: survey is closed, quota reached, or you are the author.');
  END IF;

  -- Record the response (proof_url is NOT NULL in the table)
  INSERT INTO public.survey_responses (survey_id, respondent_id, proof_url)
  VALUES (p_survey_id, v_user_id, trim(p_proof_url));

  RETURN jsonb_build_object('status', 'recorded');
END;
$$;

REVOKE ALL ON FUNCTION public.record_survey_response(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.record_survey_response(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: close_survey_early — author manually closes before quota
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_survey_early(p_survey_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.community_posts
  SET
    service_status = 'completed',
    completed_at   = now(),
    updated_at     = now()
  WHERE id = p_survey_id
    AND author_id = auth.uid()
    AND service_category = 'fyp_survey'
    AND service_status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Survey not found or you do not have permission to close it.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.close_survey_early(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.close_survey_early(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. FAIR QUEUE VIEW — surveys ranked by fewest responses (most urgent first)
--    Partitioned by university so fairness is within the same school
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.survey_fair_queue AS
SELECT
  cp.*,
  RANK() OVER (
    PARTITION BY cp.university_id
    ORDER BY cp.survey_respond_count ASC, cp.created_at ASC
  ) AS queue_position,
  -- Percentage filled
  ROUND(
    (cp.survey_respond_count::NUMERIC / NULLIF(cp.survey_quota, 0)) * 100
  ) AS fill_percent
FROM public.community_posts cp
WHERE cp.post_type = 'service'
  AND cp.service_category = 'fyp_survey'
  AND cp.service_status = 'open';

-- ---------------------------------------------------------------------------
-- 8. INDEXES FOR PERFORMANCE
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey
  ON public.survey_responses(survey_id);

CREATE INDEX IF NOT EXISTS idx_survey_responses_respondent
  ON public.survey_responses(respondent_id);

CREATE INDEX IF NOT EXISTS idx_survey_respond_count
  ON public.community_posts(survey_respond_count)
  WHERE service_category = 'fyp_survey';

CREATE INDEX IF NOT EXISTS idx_community_posts_fyp_survey
  ON public.community_posts(university_id, service_status, survey_respond_count)
  WHERE service_category = 'fyp_survey';

-- ---------------------------------------------------------------------------
-- DONE — Run this migration and then deploy the app changes.
-- ---------------------------------------------------------------------------
