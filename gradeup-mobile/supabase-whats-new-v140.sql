-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.4.0
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.4.0',
  'What''s New in Rencana v1.4.0 🎉',
  '• Room Location
Find and contribute classroom locations, facilities, and study spaces on the interactive campus map!
• Confessions
Share anonymous thoughts and reply to others directly on the campus map!
• More Mini-games
Added even more mini-games for you to play and challenge your friends.
• Notifications
Fixed issues so you never miss an important update.
• Improvements
Squashed bugs for a faster, smoother app experience.'
);
