-- Lock screen: remote-configurable "Rencana Lock Screen" shortcut link.
--
-- iOS gives apps no way to set the wallpaper, so the self-refreshing lock
-- screen runs through a shortcut: "Get lock screen image" (Rencana's App
-- Intent) → "Set Wallpaper". The shortcut lives in iCloud and its share link
-- can be rotated or republished at any time; keeping the URL here lets the
-- lock screen setup point at a new one without shipping an app update.
--
-- NULL / empty means "not published yet": the client opens the Shortcuts app
-- and shows the steps to build the shortcut by hand.

alter table public.app_config
  add column if not exists lock_screen_shortcut_url text;

comment on column public.app_config.lock_screen_shortcut_url is
  'iCloud link to the "Rencana Lock Screen" shortcut. NULL = not published; the app shows manual build steps instead.';

insert into public.app_config (id) values ('default')
on conflict (id) do nothing;
