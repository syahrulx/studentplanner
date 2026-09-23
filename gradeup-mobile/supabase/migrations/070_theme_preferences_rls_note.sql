-- theme_preferences lives on profiles; existing "Users manage own profile" RLS applies.
-- Web/mobile sync writes JSON: { theme, themePack, spiderBlueAccents?, customThemeColors? }.
-- subscription_plan remains locked by profiles_lock_subscription_plan trigger (migration 037).

comment on column public.profiles.theme_preferences is
  'Client-synced UI theme JSON. Writable only on own profile row via RLS; not used for authorization.';
