-- Only one account may store the owner banner.
--
-- profiles.profile_banner is a plain text column and RLS lets a student write
-- their own row, which is correct for every other banner: the app decides what
-- a plan unlocks, and the worst case is someone giving themselves a colour.
-- The owner banner is different — it is not for sale, so "the app decides" is
-- not a boundary, it is a suggestion. Anyone who guessed the id could have
-- written it through the API.
--
-- The app now refuses to draw it for anyone else, on their own card and on
-- every other phone. This stops it being stored at all, so the two do not have
-- to agree forever.
--
-- Everything else is still free to write. This names one value and one row.

alter table public.profiles
  drop constraint if exists profile_banner_owner_only;

alter table public.profiles
  add constraint profile_banner_owner_only
  check (
    profile_banner is distinct from 'nebula'
    or id = 'a44b03d4-3ab8-47f5-91cf-f88720fcb204'::uuid
  );

comment on constraint profile_banner_owner_only on public.profiles is
  'The nebula banner belongs to one account. See src/lib/profileBanners.ts OWNER_USER_ID.';
