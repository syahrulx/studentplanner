-- =============================================================================
-- Study Snap: let a student choose who sees a snap
-- =============================================================================
--
-- Until now a snap was readable only by its author and accepted friends, which
-- is the right default and stays the default here. This adds two wider choices,
-- picked per snap at the moment of posting: the author's campus, or their whole
-- university. Nothing wider — there is no "every student in the country" option
-- on purpose.
--
-- EXISTING ROWS ARE UNTOUCHED. `audience` arrives with DEFAULT 'friends', so
-- every snap already posted keeps exactly the visibility it had. This migration
-- runs no UPDATE and no DELETE.
--
-- To see the size of what this alters before running it:
--   SELECT count(*) AS snaps, count(*) FILTER (WHERE expires_at > now()) AS live
--   FROM public.study_snaps;

-- ─── 1. Columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.study_snaps
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'friends',
  -- Author's university and campus, copied in at post time rather than joined
  -- on read. A student who later transfers does not retroactively move the
  -- snaps they posted at their old campus into their new one's feed, and the
  -- feed query stays a plain index scan. Same reasoning as confessions.
  ADD COLUMN IF NOT EXISTS university_id text,
  ADD COLUMN IF NOT EXISTS campus text,
  -- Moderation. A photo shared past the author's friends list can be reported,
  -- and must be removable without deleting the author's streak history.
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'snap_audience_valid' AND table_name = 'study_snaps'
  ) THEN
    ALTER TABLE public.study_snaps
      ADD CONSTRAINT snap_audience_valid
      CHECK (audience IN ('friends', 'campus', 'university'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'snap_status_valid' AND table_name = 'study_snaps'
  ) THEN
    ALTER TABLE public.study_snaps
      ADD CONSTRAINT snap_status_valid
      CHECK (status IN ('active', 'flagged', 'removed'));
  END IF;
END $$;

-- The shared-feed read: one university, optionally one campus, still live.
CREATE INDEX IF NOT EXISTS idx_study_snaps_shared_feed
  ON public.study_snaps (university_id, campus, audience, status, created_at DESC)
  WHERE audience <> 'friends';

-- ─── 2. Stamp the author's university and campus on insert ───────────────────
--
-- Done in a trigger, not by the client. A client that sets its own
-- university_id could post into any university's feed it liked.

CREATE OR REPLACE FUNCTION public.set_snap_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT p.university_id, p.campus
    INTO NEW.university_id, NEW.campus
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  -- A student with no university on their profile has no shared feed to post
  -- into, so the snap stays with their friends rather than going nowhere.
  IF NEW.university_id IS NULL AND NEW.audience <> 'friends' THEN
    NEW.audience := 'friends';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_snap_origin ON public.study_snaps;
CREATE TRIGGER trg_set_snap_origin
  BEFORE INSERT ON public.study_snaps
  FOR EACH ROW EXECUTE FUNCTION public.set_snap_origin();

-- ─── 3. Reads ────────────────────────────────────────────────────────────────
--
-- The existing "own snaps" and "friends snaps" policies are left alone: a
-- friend still sees a friend's snap whatever its audience. This adds the
-- shared-feed read on top.

DROP POLICY IF EXISTS "Users can read shared snaps" ON public.study_snaps;
CREATE POLICY "Users can read shared snaps"
  ON public.study_snaps FOR SELECT
  USING (
    audience <> 'friends'
    AND status = 'active'
    AND expires_at > now()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.university_id IS NOT NULL
        AND p.university_id = study_snaps.university_id
        AND (
          study_snaps.audience = 'university'
          -- A campus snap needs both sides to agree on a campus. NULL campus
          -- on either side is not a match, so it cannot leak to a whole
          -- university through a missing value.
          OR (study_snaps.campus IS NOT NULL AND p.campus = study_snaps.campus)
        )
    )
  );

-- A snap an admin took down must stop showing to the author's friends too,
-- which is the whole point of taking it down. Every existing row is 'active',
-- so this changes nothing for anyone until an admin removes something.
DROP POLICY IF EXISTS "Users can read friends snaps" ON public.study_snaps;
CREATE POLICY "Users can read friends snaps"
  ON public.study_snaps FOR SELECT
  USING (
    status <> 'removed'
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = (SELECT auth.uid()) AND f.addressee_id = study_snaps.user_id)
          OR (f.addressee_id = (SELECT auth.uid()) AND f.requester_id = study_snaps.user_id)
        )
    )
  );

-- Admins read everything, and are the only ones who may change `status`.
DROP POLICY IF EXISTS "Admins manage snaps" ON public.study_snaps;
CREATE POLICY "Admins manage snaps"
  ON public.study_snaps FOR ALL
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ─── 4. Reports ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.snap_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snap_id      uuid NOT NULL REFERENCES public.study_snaps(id) ON DELETE CASCADE,
  reporter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_snap_report UNIQUE (snap_id, reporter_id),
  CONSTRAINT snap_report_reason_length CHECK (char_length(reason) <= 300)
);

CREATE INDEX IF NOT EXISTS idx_snap_reports_snap ON public.snap_reports (snap_id);

ALTER TABLE public.snap_reports ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the snap can report it. Reporters cannot read the table
-- back: who reported whom is not something students should be able to look up.
DROP POLICY IF EXISTS snap_reports_insert ON public.snap_reports;
CREATE POLICY snap_reports_insert ON public.snap_reports
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = reporter_id
    AND EXISTS (SELECT 1 FROM public.study_snaps s WHERE s.id = snap_id)
  );

DROP POLICY IF EXISTS snap_reports_admin_all ON public.snap_reports;
CREATE POLICY snap_reports_admin_all ON public.snap_reports
  FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ─── 5. Auto-hide on repeated reports ────────────────────────────────────────
--
-- Three reports, not the five confessions use. A confession is text a reader
-- can scroll past; a photo is seen the moment it is on screen, so it comes
-- down first and an admin reviews afterwards. Only shared snaps are affected —
-- a friends-only snap is not a feed anyone can brigade.

CREATE OR REPLACE FUNCTION public.auto_flag_reported_snap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.snap_reports
  WHERE snap_id = NEW.snap_id;

  IF v_count >= 3 THEN
    UPDATE public.study_snaps
    SET status = 'flagged'
    WHERE id = NEW.snap_id
      AND status = 'active'
      AND audience <> 'friends';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_flag_reported_snap ON public.snap_reports;
CREATE TRIGGER trg_auto_flag_reported_snap
  AFTER INSERT ON public.snap_reports
  FOR EACH ROW EXECUTE FUNCTION public.auto_flag_reported_snap();

COMMENT ON COLUMN public.study_snaps.audience IS
  'friends (default) | campus | university. Set per snap at post time.';
COMMENT ON COLUMN public.study_snaps.status IS
  'active | flagged (auto-hidden after 3 reports) | removed (by an admin).';
