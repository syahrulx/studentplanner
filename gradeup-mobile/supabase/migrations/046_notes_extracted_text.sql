-- Add extracted_text column to notes table.
-- Caches PDF-extracted text so AI features (quiz, flashcards, chat)
-- never re-extract the same PDF twice.
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- Index for quick "has cached text?" checks.
CREATE INDEX IF NOT EXISTS idx_notes_extracted_text_not_null
  ON public.notes (user_id, id)
  WHERE extracted_text IS NOT NULL;
