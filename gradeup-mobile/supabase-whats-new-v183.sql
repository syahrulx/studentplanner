-- What's New for 1.8.3, covering 1.8.1 -> 1.8.3.
--
-- 1.8.2 most likely never reached a store (its only EAS build, iOS 156, was
-- built from the flawed expiry check), so this prompt also carries 1.8.2's
-- calendar fix — see store-release-notes-v183.md. If a 1.8.2 build did go
-- live, drop the last bullet before running.
--
-- New: the Timetable options sheet, timetable export as PDF, and a group
-- toggle plus "Online" for room-less classes on the lock screen. The week grid
-- is back to its calmer 1.8.0 look with Monday to Friday on one screen.
--
-- Run this only once the build is actually live on both stores, otherwise it
-- announces features students cannot install yet.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.8.3
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.8.3',
  'What''s New in Rencana v1.8.3 🎉',
  '• Timetable options: pick grid or list, and choose what each class shows — course name, room, lecturer, group.
• Export your timetable as a PDF, portrait or landscape, to print or share.
• Your lock screen can show your class group, and classes with no room now say Online.
• Your week fits one screen again, Monday to Friday, in calmer colours.
• Your semester week is correct again. The app moves on to your new semester, and a week you set by hand no longer carries over.'
);
