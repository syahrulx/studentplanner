-- What's New for 1.7.1. Covers 1.7.0 -> 1.7.1, most-felt fix first.
--
-- 1.7.1 is a fix release, so there are no new features to lead with. The items
-- are ordered by how often a student would have hit the problem: the save
-- popup appeared on every edit, the grade and calendar entries were features
-- you could not finish at all, and the rest are narrower.
--
-- One line per item, and the whole block stays under the 500-character limit
-- on the Play Console release-notes field, so the same copy ships in the app
-- and in the store listing without being rewritten twice and drifting apart.
--
-- Not listed: the Back Tap shortcut link is now fetched at runtime (bcfabef)
-- and each build profile is bound to its EAS environment (a73f932). Neither
-- changes anything a student sees.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.7.1
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.7.1',
  'What''s New in Rencana v1.7.1 🎉',
  '• Saves stay quiet unless one fails, then you get Retry.
• Add Level now opens a row for custom grade scales.
• An empty draft row no longer blocks publishing a calendar.
• The semester you pick stays picked.
• Smart Capture reads Malay dates like "jumaat ni".
• Group chat screenshots pick the message with the deadline.
• Smoother pinch zoom on handwritten pages.
• Tablet home now offers Break Down A Task.'
);
