-- What's New for 1.8.4, covering 1.8.3 -> 1.8.4.
--
-- Two lock screen templates, Timetable and Grid, that carry no date, so the
-- picture Android saves once stays right all semester. Glance is removed; a
-- student who had it lands on Today. Friend search now shows who is already a
-- friend or has asked, and says "already friends" instead of an error.
--
-- Run this only once the build is actually live on both stores, otherwise it
-- announces features students cannot install yet.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.8.4
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.8.4',
  'What''s New in Rencana v1.8.4 🎉',
  '• Two new lock screen templates: Timetable, your whole week as a list with times and rooms, and Grid, a mini timetable grid.
• Neither shows a date, so on Android you can save one as your wallpaper and it stays right all semester.
• Friend search shows who''s already a friend or has a request waiting, and lets you accept right there.
• The Glance template is gone. If you used it, you''re on Today now.
• Adding someone who''s already your friend now says so, instead of "Something went wrong".'
);
