-- What's New for 1.7.3. Covers 1.7.2 -> 1.7.3, most-felt item first.
--
-- The items are ordered by how many students the change reaches. Every student
-- on a semester that is not 14 teaching weeks was affected by the first three:
-- the count could not be set, a count that was set got overwritten on reload,
-- and aligning the week did not move the week shown on Home. The Smart Capture
-- cap reaches Free users only, and MICP reaches one college, so those go last.
--
-- One bullet per item, because WhatsNewPrompt.tsx renders one card per bullet
-- line and treats a following non-bullet line as that card's sub-text. It has
-- no concept of a section heading, so a numbered "New / Fixes" layout pairs
-- lines up wrongly here.
--
-- The store listing therefore carries a different layout — see
-- store-release-notes-v173.md, which does group into New and Fixes. Wording
-- and layout differ on purpose; the substance must not. Change one, change
-- the other.
--
-- Not listed: Circles and Locations were removed from the admin web sidebar
-- (c1e6a9b). That is the staff console, not the student app, and no student
-- screen changed.
--
-- The Smart Capture line only holds once ai_generate is redeployed (4ba47b0).
-- The Edge Function enforces the cap, so until it ships the server still
-- rejects the third capture and this line would be a promise the app breaks.

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
• Free plan now gets 3 Smart Captures a day, up from 2.
• MAHSA International College (Penang) is now on the university list.'
);
