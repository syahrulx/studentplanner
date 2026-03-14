-- Add optional subject_id to flashcard_folders so folders can be grouped by subject (e.g. chapters/topics per course).
-- Run in Supabase SQL Editor if you already have flashcard_folders from supabase-study-schema.sql.

alter table public.flashcard_folders
  add column if not exists subject_id text;

-- RLS is unchanged: users can still only access their own rows (user_id). subject_id is application-level grouping.
-- No new policy needed.