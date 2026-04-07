-- Migration: Add unique constraint on quiz_scores (user_id, session_id)
-- This prevents duplicate XP rows if finishParticipant is retried (crash recovery)
-- The application now uses upsert with onConflict to safely handle retries.

ALTER TABLE quiz_scores
  ADD CONSTRAINT quiz_scores_user_session_unique
  UNIQUE (user_id, session_id);

-- Required UPDATE policy: Supabase upsert on conflict performs an UPDATE,
-- which is blocked by RLS without an explicit UPDATE policy.
-- Without this, the upsert silently fails on duplicate key, losing XP.
CREATE POLICY "Users can update their own scores"
  ON quiz_scores FOR UPDATE
  USING (auth.uid() = user_id);
