-- Allow mobile app users to read admin-managed university catalog.
-- Writes remain admin-only via existing universities_admin_* policies.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'universities'
      and policyname = 'universities_mobile_read'
  ) then
    create policy "universities_mobile_read"
      on public.universities
      for select
      to authenticated
      using (true);
  end if;
end $$;

