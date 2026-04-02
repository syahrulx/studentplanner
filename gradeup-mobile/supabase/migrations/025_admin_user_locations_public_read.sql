-- Admins (is_admin()) can list user_locations rows where visibility is public (admin-web with session JWT).
-- Skips if user_locations does not exist (e.g. community schema not applied yet).

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_locations'
  ) then
    execute 'drop policy if exists "user_locations_admin_public_select" on public.user_locations';
    execute $p$
      create policy "user_locations_admin_public_select"
      on public.user_locations for select
      to authenticated
      using (public.is_admin() and visibility = 'public')
    $p$;
  end if;
end $$;
