-- Sync app theme preferences (base theme, premium pack, custom colors) across devices.
alter table public.profiles
  add column if not exists theme_preferences jsonb;

comment on column public.profiles.theme_preferences is
  'App theme sync: { theme, themePack, spiderBlueAccents?, customThemeColors? }';
