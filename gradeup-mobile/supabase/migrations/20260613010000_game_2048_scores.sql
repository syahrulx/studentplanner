-- 2048 minigame scores table.
-- One row per user holding their bests + lifetime Rencana Points, used for the
-- leaderboard. Ranking is by best_tile, with best_score as the tiebreaker.

CREATE TABLE IF NOT EXISTS game_2048_scores (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  best_score   integer NOT NULL DEFAULT 0,
  best_tile    integer NOT NULL DEFAULT 0,
  total_points integer NOT NULL DEFAULT 0,
  games_played integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Leaderboard ordering: best_tile desc, best_score desc.
CREATE INDEX IF NOT EXISTS idx_game_2048_scores_rank
  ON game_2048_scores (best_tile DESC, best_score DESC);

-- RLS
ALTER TABLE game_2048_scores ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read all rows (global + friend leaderboards).
DROP POLICY IF EXISTS "game_2048_scores_select" ON game_2048_scores;
CREATE POLICY "game_2048_scores_select"
  ON game_2048_scores FOR SELECT
  USING (true);

-- Users may write only their own row.
DROP POLICY IF EXISTS "game_2048_scores_insert" ON game_2048_scores;
CREATE POLICY "game_2048_scores_insert"
  ON game_2048_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_2048_scores_update" ON game_2048_scores;
CREATE POLICY "game_2048_scores_update"
  ON game_2048_scores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
