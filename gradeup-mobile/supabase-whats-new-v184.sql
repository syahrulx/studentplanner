-- What's New for 1.8.4. Covers 1.7.9 -> 1.8.4 as far as students are concerned.
--
-- 1.8.0, 1.8.2 and 1.8.3 were never built. The last build that reached anyone
-- is 1.8.1 (iOS 155, Android 166), so three versions' worth of work lands at
-- once and this prompt is the only place it can be said properly: the stores
-- cap release notes, this does not.
--
-- Ordered by how many students each reaches and how badly the bug read to
-- them. The semester week leads because it was wrong on the Home screen on the
-- first morning of a new semester and several students reported it. The
-- handwriting and notes fixes follow: both read as the app damaging your work
-- rather than as a glitch. Features come after, because a student who never
-- opens the lock screen planner is unaffected by it.
--
-- Run this only once the build is live on both stores, otherwise it announces
-- things that cannot be installed yet.

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
  '• Your semester week is correct again. The app moves on to your new semester, and a week you set by hand no longer carries over.
• Your handwriting stays as you wrote it, instead of being redrawn as shapes.
• Smoother zoom in notes, and a zoomed page no longer looks cut off.
• Widgets show the right day again, and the small Classes widget is back to four classes.
• Subject colours match on every device.
• Put your day or week on your lock screen — four templates: Today, Week, Timetable and Grid. On iPhone it refreshes itself every morning.
• New Week and Task List widgets for your home screen and lock screen.
• Timetable options: grid or list, choose what each class shows, and 12-hour time.
• Export your timetable as a PDF, portrait or landscape.
• Replies to your confession or comment notify you, and you can turn that off for one post or for all of them.
• Friend requests now tell you what actually happened instead of "something went wrong".
• Rencana warns you when your phone is out of storage, instead of quietly failing to save.'
);
