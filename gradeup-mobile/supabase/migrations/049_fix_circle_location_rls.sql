-- Fix 'Friends can read locations' policy to correctly enforce the circle_location_visibility allowlist
-- Previously, it broadcasted your location to ANY circle you were in, completely ignoring the allowlist!

do $$
begin
  drop policy if exists "Friends can read locations" on public.user_locations;

  create policy "Friends can read locations"
  on public.user_locations for select using (
    visibility = 'public'
    or (
      visibility = 'friends'
      and exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = auth.uid() and f.addressee_id = user_locations.user_id)
            or (f.addressee_id = auth.uid() and f.requester_id = user_locations.user_id)
          )
      )
    )
    or (
      visibility = 'circles'
      and exists (
        select 1
        from public.circle_location_visibility clv
        join public.circle_members cm
          on clv.circle_id = cm.circle_id
        where clv.user_id = user_locations.user_id
          and cm.user_id = auth.uid()
      )
    )
  );
end $$;
