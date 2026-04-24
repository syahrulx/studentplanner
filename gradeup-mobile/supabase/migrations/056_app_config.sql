-- 056_app_config.sql
-- App-level remote config: used by the mobile client to gate
-- soft / hard "please update" prompts against the currently installed
-- native version. A single `default` row is read by all clients.

create table if not exists public.app_config (
  id text primary key default 'default',

  -- Minimum version users are ALLOWED to run. If current < min_version ⇒
  -- show a blocking "Update required" screen (hard update).
  ios_min_version        text not null default '1.0.0',
  android_min_version    text not null default '1.0.0',

  -- Most recent version available on the stores. If current < latest_version
  -- (but >= min_version) ⇒ show a dismissible "New version available" sheet.
  ios_latest_version     text not null default '1.0.0',
  android_latest_version text not null default '1.0.0',

  -- Store URLs (allows us to rotate localized App Store pages without a rebuild).
  ios_store_url     text not null default 'https://apps.apple.com/my/app/rencana/id6762103809',
  android_store_url text not null default 'https://play.google.com/store/apps/details?id=com.aizztech.rencana',

  -- Optional, localized marketing copy shown inside the prompt.
  -- Falls back to bundled i18n strings when null.
  message_en text,
  message_ms text,

  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

-- Anyone (even unauthenticated users, e.g. on the login screen) can read
-- the config so we can gate the whole app before sign-in.
drop policy if exists "app_config readable" on public.app_config;
create policy "app_config readable"
  on public.app_config
  for select
  to anon, authenticated
  using (true);

-- Only service_role (admin_web / Supabase dashboard) can write.
-- We intentionally DO NOT expose update/insert/delete to clients.

-- Seed the default row if it doesn't exist. Safe to re-run.
insert into public.app_config (id) values ('default')
on conflict (id) do nothing;

comment on table public.app_config is
  'Remote config read on app launch to drive soft / hard "Update available" prompts.';
