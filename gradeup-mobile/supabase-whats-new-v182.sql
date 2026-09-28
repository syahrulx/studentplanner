-- What's New for 1.8.2. A fix-only release, covering 1.8.1 -> 1.8.2.
--
-- Worth a prompt even though nothing is new: the bug was visible on the Home
-- screen for thousands of students on the first morning of a new semester, and
-- several reported it. Saying it is fixed is the point.
--
-- Two defects compounded. The calendar was fetched once and never refreshed,
-- so a finished semester froze the student there — 5,184 active calendars
-- still started in March while the new term had begun in late September. On
-- top of that, a manual week alignment survived into the next semester and was
-- added to the stale week. Hence "Week 10" and "Week 12" on a day that should
-- have read "Week 1".
--
-- Run this only once the build is actually live on both stores, otherwise it
-- announces a fix students cannot install yet.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.8.2
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.8.2',
  'What''s New in Rencana v1.8.2 🎉',
  '• Your semester week is correct again. The app now picks up your new semester instead of staying on the old one.
• A week you set by hand no longer carries over into the next semester, so a new semester starts at Week 1.
• Semester Pulse, your timetable week and class reminders all follow the corrected week.'
);
