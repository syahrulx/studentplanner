-- Add 'circles' as a valid visibility option and allow users who share
-- a circle to see each other's location when visibility = 'circles'.

do $$
declare
  constraint_name text;
begin
  -- Find the existing CHECK constraint on user_locations.visibility
  select ccu.constraint_name
  into constraint_name
  from information_schema.constraint_column_usage ccu
  join information_schema.check_constraints cc
    on cc.constraint_name = ccu.constraint_name
  where ccu.table_schema = 'public'
    and ccu.table_name = 'user_locations'
    and ccu.column_name = 'visibility'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.user_locations drop constraint %I', constraint_name);
  end if;

  -- New CHECK including 'circles'
  alter table public.user_locations
    add constraint user_locations_visibility_check
    check (visibility in ('public', 'friends', 'circles', 'off'));

  -- Replace Friends can read locations policy to include circles
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
        from public.circle_members cm_me
        join public.circle_members cm_them
          on cm_me.circle_id = cm_them.circle_id
        where cm_me.user_id = auth.uid()
          and cm_them.user_id = user_locations.user_id
      )
    )
  );
end $$;

