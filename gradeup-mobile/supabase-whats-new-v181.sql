-- What's New for 1.8.1. Covers 1.7.9 -> 1.8.1, most-felt item first.
--
-- The range is 1.7.9, not 1.8.0. A "release 1.8.0" commit exists but no build
-- was ever produced from it, so the last version students actually have is
-- 1.7.9 (iOS 151, Android 163). Everything since then is new to them.
--
-- Ordering is by how many students the change reaches. Subject colours and the
-- widget rollover were silent failures that hit anyone with a second device or
-- a widget, so they lead. The lock screen is the bigger feature but it is
-- opt-in, so it follows. Confession replies reach community users, and the
-- storage warning is rare but severe.
--
-- The lock screen line says "on iPhone" on purpose. Both platforms can build
-- and save the wallpaper; only iOS refreshes it every morning, because that
-- half is a Shortcuts automation driving an App Intent. This prompt is shown
-- on both platforms, so the line has to be true on both.
--
-- One bullet per item, because WhatsNewPrompt.tsx renders one card per bullet
-- line and treats a following non-bullet line as that card's sub-text. It has
-- no concept of a section heading, so a numbered "New / Fixes" layout pairs
-- lines up wrongly here.
--
-- The store listing therefore carries a different layout — see
-- store-release-notes-v181.md, which does group into New and Fixes, and which
-- carries a separate Play body for the same lock screen reason. Wording and
-- layout differ on purpose; the substance must not. Change one, change the
-- other.
--
-- Not listed: admin user search (9d66fec) is the staff console, and the
-- community-push key fix (0f51c0c) and migration re-run fix (179ede4) are
-- server-side. No student screen changed for any of them.
--
-- The two confession lines only hold once the three migrations are run and
-- community-push is redeployed. Both were done on 2026-09-28, before this
-- file was written.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.8.1
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.8.1',
  'What''s New in Rencana v1.8.1 🎉',
  '• Subject colours now match on every device, instead of only the one you set them on.
• Timetable and task widgets roll over at midnight again, instead of sticking on an old day.
• Put your day on your lock screen — on iPhone it refreshes itself every morning.
• Someone replies to your confession or your comment? You get a notification, and it opens the thread.
• Turn those reply alerts off for one post, or all at once in Community settings.
• Rooms now show on the Next line, even on days with no classes.
• Rencana now tells you when your device is out of storage, instead of quietly failing to save.'
);
