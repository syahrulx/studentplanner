-- Keep remote update-gate values aligned with the current shipped app version.
-- Current mobile app version in app.json: 1.1.0
insert into public.app_config (
  id,
  ios_min_version,
  android_min_version,
  ios_latest_version,
  android_latest_version,
  updated_at
)
values (
  'default',
  '1.1.0',
  '1.1.0',
  '1.1.0',
  '1.1.0',
  now()
)
on conflict (id) do update
set
  ios_min_version = excluded.ios_min_version,
  android_min_version = excluded.android_min_version,
  ios_latest_version = excluded.ios_latest_version,
  android_latest_version = excluded.android_latest_version,
  updated_at = now();
