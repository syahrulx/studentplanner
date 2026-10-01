-- What's New for 1.8.5. Covers 1.8.4 -> 1.8.5.
--
-- Genuinely small, unlike the last few. 1.8.4 shipped — iOS 160 in review,
-- Android 171 rolling out — so this is only what landed after it.
--
-- The friend fix leads. A student who tapped Add on someone already their
-- friend got "Request not sent. Something went wrong. Please try again." and
-- did try again, which is the worst kind of error message: it invited the one
-- action that could not work.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.8.5
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.8.5',
  'What''s New in Rencana v1.8.5 🎉',
  '• Friend requests now tell you what actually happened — already friends, already sent — instead of "something went wrong".
• The small Classes widget shows four classes again, not two.
• New: 12-hour time. Switch your timetable to 1:00 PM instead of 13:00, under timetable options.'
);
