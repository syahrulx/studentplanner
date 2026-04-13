-- Expo Push API token for remote notifications (EAS + Expo push service).
-- Rely on existing "Users manage own profile" (or equivalent) UPDATE policy for auth.uid() = id.

alter table public.profiles
  add column if not exists expo_push_token text,
  add column if not exists expo_push_token_updated_at timestamptz;

comment on column public.profiles.expo_push_token is 'ExponentPushToken[...] from expo-notifications; send via Expo Push API or EAS.';
comment on column public.profiles.expo_push_token_updated_at is 'Last time the client registered or refreshed this token.';
