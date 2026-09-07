-- What's New for 1.7.1. Covers 1.7.0 -> 1.7.1, most-felt fix first.
--
-- 1.7.1 is a fix release, so there are no new features to lead with. The items
-- are ordered by how often a student would have hit the problem: the save
-- popup appeared on every edit, the grade and calendar entries were features
-- you could not finish at all, and the rest are narrower.
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
  '• No More Popup On Every Save
Every edit briefly queues before it syncs, and Rencana was announcing all of them. You now only hear from it when a save actually fails, with a Retry button.
• Add Your Own Grade Levels
Tapping Add Level on a custom grade scale did nothing visible, so there was no way to type the grade in. The row now appears ready for the letter, minimum mark and points.
• Finish Publishing Your Calendar
One empty draft row in the timeline was enough to block the whole calendar from being published. Empty rows are now skipped instead of counted as a mistake.
• The Semester You Pick Stays Picked
The semester picker could snap back to the previous choice after you selected one. It now keeps what you chose.
• Malay Dates In Smart Capture
Share a message saying "jumaat ni" and it now becomes a task due that Friday, instead of a task with no date at all.
• The Right Message From A Screenshot
Sharing a screenshot of a busy group chat used to pull in whatever was on screen. Rencana now picks out the one message that carries the deadline.
• Smoother Handwriting Zoom
Pinching to zoom on a handwritten page settled with a visible snap, most noticeably on iPad. The zoom now lands in a single frame.
• A Way In From The Tablet Home
On a tablet, the plans area was simply blank until you had broken a task down. It now shows a Break Down A Task button instead of empty space.'
);
