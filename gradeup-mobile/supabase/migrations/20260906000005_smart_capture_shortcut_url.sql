-- Smart Capture: remote-configurable Back Tap shortcut link.
--
-- The iOS shortcut ("Take Screenshot → Rencana: Plan from screenshot") lives in
-- iCloud and its share link can be rotated or republished at any time. Keeping
-- the URL in app_config means the Smart automations screen can point at a new
-- shortcut without shipping an app update.
--
-- NULL / empty means "not published yet": the client falls back to opening the
-- Shortcuts app so the on-screen steps still work.

alter table public.app_config
  add column if not exists smart_capture_shortcut_url text;

comment on column public.app_config.smart_capture_shortcut_url is
  'iCloud link to the "Plan from screenshot" shortcut. NULL = not published; the app opens the Shortcuts app instead.';

-- Existing installs already have the `default` row; this is a no-op for them
-- and only matters on a fresh database.
insert into public.app_config (id) values ('default')
on conflict (id) do nothing;
