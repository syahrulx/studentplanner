-- What's New for 1.7.2. Covers 1.7.1 -> 1.7.2, most-felt fix first.
--
-- 1.7.2 is another fix release, so the items are ordered by how often a
-- student would have hit the problem. Quiz challenges were broken end to end
-- — the push went to the wrong screen and challenging from a profile made you
-- pick the same friend twice — so those lead. The campus alias fix blocked a
-- calendar contribution outright, but for fewer people. The Dynamic Island
-- padding is cosmetic and goes last.
--
-- One line per item, and the whole block stays under the 500-character limit
-- on the Play Console release-notes field, so the same copy ships in the app
-- and in the store listing without being rewritten twice and drifting apart.
--
-- Not listed: the trial countdown banner was removed from the home screen
-- (8d66a65). Settings still shows the same countdown on the plan row, so no
-- information was lost and there is nothing for a student to act on.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.7.2
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.7.2',
  'What''s New in Rencana v1.7.2 🎉',
  '• Tapping a quiz challenge now opens the match it invites you to.
• Challenge a friend straight from their profile, without picking them twice.
• Joining by code tells you what went wrong instead of just "invalid".
• Your campus is recognised even when your profile uses the short name.
• Universiti Sultan Azlan Shah (USAS) is now on the university list.
• MATCH RESULTS no longer sits under the Dynamic Island.'
);
