-- 20261015000004_rentaman_opt_in.sql
--
-- The RenTaman avatar is opt-in: hidden unless the student turns it on.
--
-- 20261015000003 showed it to everyone unless hidden. It now shows only when
-- the student switches "Show my RenTaman avatar" on, and then both on their
-- own profile and on their card for other students. Off by default for every
-- existing and new account, so nobody's avatar appears without them choosing.
--
-- Adds one column (default false, so no existing row changes meaning) and
-- replaces rentaman_avatar_for. Changes no other data. Safe to run twice.

alter table public.profiles
  add column if not exists rentaman_shown boolean not null default false;

comment on column public.profiles.rentaman_shown is
  'Student chose to show their RenTaman avatar on their profile and profile card. Off by default.';

-- The return type changes (adds `shown`), so the old one has to go first.
drop function if exists public.rentaman_avatar_for(uuid);

create function public.rentaman_avatar_for(p_user_id uuid)
returns table(nickname text, look jsonb, shown boolean)
language sql
stable
security definer
set search_path = public
as $$
  -- Your own: always, with the switch's state, so the settings screen can show
  -- what you'd be turning on. Anyone else's: only if they turned it on.
  select w.nickname, w.look, p.rentaman_shown
  from public.study_world_profiles w
  join public.profiles p on p.id = w.user_id
  where w.user_id = p_user_id
    and (select auth.uid()) is not null
    and (w.user_id = (select auth.uid()) or p.rentaman_shown)
$$;

revoke all on function public.rentaman_avatar_for(uuid) from public, anon;
grant execute on function public.rentaman_avatar_for(uuid) to authenticated;

comment on function public.rentaman_avatar_for(uuid) is
  'Nickname, look and the show switch of one student''s RenTaman avatar. Others only see it when rentaman_shown is on.';
