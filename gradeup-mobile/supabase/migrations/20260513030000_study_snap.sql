-- =============================================================================
-- Study Snap: daily photo check-in feature
-- =============================================================================

-- 1. study_snaps — each photo posted by a user
CREATE TABLE IF NOT EXISTS public.study_snaps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url   text NOT NULL,
  caption     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),

  CONSTRAINT snap_caption_length CHECK (char_length(caption) <= 200)
);

CREATE INDEX IF NOT EXISTS idx_study_snaps_user_created
  ON public.study_snaps(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_study_snaps_expires
  ON public.study_snaps(expires_at);

-- 2. snap_reactions — emoji reactions on snaps
CREATE TABLE IF NOT EXISTS public.snap_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snap_id     uuid NOT NULL REFERENCES public.study_snaps(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       text NOT NULL DEFAULT '🔥',
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_snap_reaction UNIQUE(snap_id, user_id)
);

-- 3. snap_streaks — per-user streak tracking
CREATE TABLE IF NOT EXISTS public.snap_streaks (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak  int NOT NULL DEFAULT 0,
  longest_streak  int NOT NULL DEFAULT 0,
  last_snap_date  date,
  revivals_used   int NOT NULL DEFAULT 0,
  revival_month   int NOT NULL DEFAULT 0,   -- YYYYMM format
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 4. Extend user_activities with custom status fields (Pro feature)
ALTER TABLE public.user_activities
  ADD COLUMN IF NOT EXISTS custom_status_text text,
  ADD COLUMN IF NOT EXISTS custom_status_emoji text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'custom_status_text_length'
      AND table_name = 'user_activities'
  ) THEN
    ALTER TABLE public.user_activities
      ADD CONSTRAINT custom_status_text_length
      CHECK (char_length(custom_status_text) <= 100);
  END IF;
END $$;

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- ── study_snaps ──
ALTER TABLE public.study_snaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own snaps"
  ON public.study_snaps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read friends snaps"
  ON public.study_snaps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = auth.uid() AND f.addressee_id = study_snaps.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = study_snaps.user_id)
        )
    )
  );

CREATE POLICY "Users can insert own snaps"
  ON public.study_snaps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own snaps"
  ON public.study_snaps FOR DELETE
  USING (auth.uid() = user_id);

-- ── snap_reactions ──
ALTER TABLE public.snap_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read snap reactions"
  ON public.snap_reactions FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own reactions"
  ON public.snap_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reactions"
  ON public.snap_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- ── snap_streaks ──
ALTER TABLE public.snap_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own streak"
  ON public.snap_streaks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read friends streaks"
  ON public.snap_streaks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = auth.uid() AND f.addressee_id = snap_streaks.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = snap_streaks.user_id)
        )
    )
  );

CREATE POLICY "Users can upsert own streak"
  ON public.snap_streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own streak"
  ON public.snap_streaks FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable Realtime for live snap updates on the map
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_snaps;
