-- Crossword mini-game scores table.
-- One row per user holding aggregate totals used for the leaderboard. Ranking is
-- by total_points (then puzzles_completed). Completion points are flat, so the
-- leaderboard differentiates players by puzzles solved, bonus words and streaks.

CREATE TABLE IF NOT EXISTS crossword_scores (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points      integer NOT NULL DEFAULT 0,
  puzzles_completed integer NOT NULL DEFAULT 0,
  best_streak       integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Leaderboard ordering: total_points desc, puzzles_completed desc.
CREATE INDEX IF NOT EXISTS idx_crossword_scores_rank
  ON crossword_scores (total_points DESC, puzzles_completed DESC);

-- RLS
ALTER TABLE crossword_scores ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read all rows (global + friend leaderboards).
DROP POLICY IF EXISTS "crossword_scores_select" ON crossword_scores;
CREATE POLICY "crossword_scores_select"
  ON crossword_scores FOR SELECT
  USING (true);

-- Users may write only their own row.
DROP POLICY IF EXISTS "crossword_scores_insert" ON crossword_scores;
CREATE POLICY "crossword_scores_insert"
  ON crossword_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "crossword_scores_update" ON crossword_scores;
CREATE POLICY "crossword_scores_update"
  ON crossword_scores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
