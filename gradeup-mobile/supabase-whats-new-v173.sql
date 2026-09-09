-- What's New for 1.7.3. Covers 1.7.2 -> 1.7.3, most-felt item first.
--
-- The whole release is the Align Week modal plus one university, so the items
-- are ordered by how many students the change reaches. Every student on a
-- semester that is not 14 teaching weeks was affected by the first three: the
-- count could not be set, a count that was set got overwritten on reload, and
-- aligning the week did not move the week shown on Home. MICP reaches one
-- college, so it goes last.
--
-- One line per item, and the whole block stays under the 500-character limit
-- on the Play Console release-notes field, so the same copy ships in the app
-- and in the store listing without being rewritten twice and drifting apart.
--
-- Not listed: Circles and Locations were removed from the admin web sidebar
-- (c1e6a9b). That is the staff console, not the student app, and no student
-- screen changed.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.7.3
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.7.3',
  'What''s New in Rencana v1.7.3 🎉',
  '• Set how many teaching weeks your semester runs — no longer fixed at 14.
• Your week count now sticks instead of resetting to 14 next time you open the app.
• Aligning your teaching week updates the week shown on Home straight away.
• Study, exam and break periods follow the week count you set.
• MAHSA International College (Penang) is now on the university list.'
);
