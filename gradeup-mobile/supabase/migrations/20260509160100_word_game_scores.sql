-- Word Game (Connections) scores table
-- Stores the best score per user per puzzle for leaderboard use.

CREATE TABLE IF NOT EXISTS word_game_scores (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id   integer NOT NULL,
  score       integer NOT NULL DEFAULT 0,
  mistakes    integer NOT NULL DEFAULT 0,
  time_ms     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, puzzle_id)
);

-- Index for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_word_game_scores_user   ON word_game_scores (user_id);
CREATE INDEX IF NOT EXISTS idx_word_game_scores_updated ON word_game_scores (updated_at);

-- RLS
ALTER TABLE word_game_scores ENABLE ROW LEVEL SECURITY;

-- Users can read all scores (needed for global + friend leaderboards)
CREATE POLICY "word_game_scores_select"
  ON word_game_scores FOR SELECT
  USING (true);

-- Users can insert/update their own scores only
CREATE POLICY "word_game_scores_insert"
  ON word_game_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "word_game_scores_update"
  ON word_game_scores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
