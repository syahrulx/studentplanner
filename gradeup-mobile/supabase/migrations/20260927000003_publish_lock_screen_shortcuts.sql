-- Lock screen: publish the three iCloud shortcuts.
--
-- "Rencana Lock Screen" is the shortcut every student installs in setup step
-- 1: Get lock screen image → Get Current wallpaper → Set Wallpaper Photo
-- (Lock Screen only, Show Preview and Crop to Subject off).
--
-- The other two exist for iOS 27, where an automation is a shortcut that
-- starts with its trigger, and the trigger travels with the shared link
-- (arriving switched off). Both run "Rencana Lock Screen" by name:
--   "Rencana Pagi"       Time of Day, 6:00 AM
--   "Rencana Bila Tutup" App Rencana, Is Closed
-- Older iOS keeps automations out of shortcuts, so the app shows those
-- students the build-it-yourself recipes instead of these two links.
--
-- NULL / empty unpublishes a link; the app falls back to manual steps.

alter table public.app_config
  add column if not exists lock_screen_morning_shortcut_url text,
  add column if not exists lock_screen_close_shortcut_url text;

comment on column public.app_config.lock_screen_morning_shortcut_url is
  'iOS 27: iCloud link to the "Rencana Pagi" automation shortcut (6:00 AM trigger → Run "Rencana Lock Screen"). NULL = show manual steps.';
comment on column public.app_config.lock_screen_close_shortcut_url is
  'iOS 27: iCloud link to the "Rencana Bila Tutup" automation shortcut (Rencana Is Closed trigger → Run "Rencana Lock Screen"). NULL = show manual steps.';

update public.app_config
   set lock_screen_shortcut_url = 'https://www.icloud.com/shortcuts/99b7be3569d54d1d88dd42d8e933f18f',
       lock_screen_morning_shortcut_url = 'https://www.icloud.com/shortcuts/61ff9af1c279409189c93eb6ed08e146',
       lock_screen_close_shortcut_url = 'https://www.icloud.com/shortcuts/9ffbc78254d248ed83ea8dfcbbabb6dd'
 where id = 'default';
