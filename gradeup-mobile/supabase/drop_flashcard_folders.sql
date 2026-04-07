-- Migrate Flashcard Folders into Notes
-- Run this in your Supabase SQL Editor!

-- 1. For every flashcard_folder, we create a corresponding "Note" 
--    if we don't want to lose the flashcards grouped in it.
INSERT INTO public.notes (id, user_id, subject_id, title, content, updated_at)
SELECT 
  id, -- We use the folder ID as the new note ID just for simplicity of migration
  user_id,
  COALESCE(subject_id, 'General'),
  name,
  'Migrated Flashcard Deck',
  created_at
FROM public.flashcard_folders
ON CONFLICT (id) DO NOTHING;

-- 2. Add note_id column if it doesn't exist, then copy folder_id data
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS note_id text;

UPDATE public.flashcards
SET note_id = folder_id
WHERE note_id IS NULL AND folder_id IS NOT NULL;

-- 3. Now that everything is safely attached to a Note, we destroy the Folders structure entirely.
ALTER TABLE public.notes DROP COLUMN IF EXISTS folder_id CASCADE;
ALTER TABLE public.flashcards DROP COLUMN IF EXISTS folder_id CASCADE;

DROP TABLE IF EXISTS public.flashcard_folders CASCADE;
