-- Track user's latest mobile platform for admin visibility.
alter table public.profiles
  add column if not exists device_platform text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_device_platform_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_device_platform_check
      check (device_platform is null or device_platform in ('ios', 'android'));
  end if;
end $$;

comment on column public.profiles.device_platform is
  'Latest known mobile platform reported by the client (ios/android).';
