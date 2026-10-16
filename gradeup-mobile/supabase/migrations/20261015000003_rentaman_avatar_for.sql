-- 20261015000003_rentaman_avatar_for.sql
--
-- Show a student's RenTaman avatar on their Rencana profile card.
--
-- study_world_profiles only lets each student read their own row, which is
-- right for the game. The app's profile card needs to show another student's
-- avatar too, so this returns exactly two things for one student: their
-- nickname and their look (the outfit choices the avatar is drawn from).
--
-- Rules, enforced here rather than trusted to the app:
--   * signed-in callers only;
--   * your own avatar always;
--   * someone else's only if they have not hidden it on their card
--     ('rentaman' in profiles.profile_hidden_fields, migration 20261015000002).
-- Nothing else from the row is returned. Read-only; changes no data.

create or replace function public.rentaman_avatar_for(p_user_id uuid)
returns table(nickname text, look jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select w.nickname, w.look
  from public.study_world_profiles w
  join public.profiles p on p.id = w.user_id
  where w.user_id = p_user_id
    and (select auth.uid()) is not null
    and (
      w.user_id = (select auth.uid())
      or not coalesce(p.profile_hidden_fields, '{}'::text[]) @> array['rentaman']::text[]
    )
$$;

revoke all on function public.rentaman_avatar_for(uuid) from public, anon;
grant execute on function public.rentaman_avatar_for(uuid) to authenticated;

comment on function public.rentaman_avatar_for(uuid) is
  'Nickname and look of one student''s RenTaman avatar, for their profile card. Respects the card''s rentaman hide switch.';
