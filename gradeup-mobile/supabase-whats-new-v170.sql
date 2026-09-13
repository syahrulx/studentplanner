-- What's New for 1.7.0. Covers 1.6.8 -> 1.7.0, biggest change first.
--
-- The prompt is shown to every user and gated only by the
-- `whats_new_seen_<version_name>` key on the device, not by the app version, so
-- the 1.6.8 items were already announced to users still on 1.6.7 and are not
-- repeated here.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.7.0
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.7.0',
  'What''s New in Rencana v1.7.0 🎉',
  '• Send Anything To Rencana
Share a message or screenshot from any app and it becomes tasks. Or double tap the back of your phone.
• Smarter Flashcards
Cards come back when you are about to forget them, not in a fixed order.
• Quizzes That Explain
Every answer now comes with the reason, quoted from your own notes.
• A Faster Tutor
Answers appear as they are written, cite your notes, and show maths properly.
• Better PDF Reading
Uploaded PDFs become clean notes with headings and described diagrams.
• Try Plus Free First
Start the trial, see exactly when it ends, cancel any time.'
);
