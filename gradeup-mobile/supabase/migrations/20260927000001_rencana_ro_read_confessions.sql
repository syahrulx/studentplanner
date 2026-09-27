-- Let the read-only diagnostics role read confessions and the universities
-- lookup. rencana_ro has SELECT grants on public but is not the owner and has
-- no BYPASSRLS, so the only SELECT path on confessions (is_admin()) hid every
-- row from it. Scoped per table on purpose: no BYPASSRLS, so profiles, notes
-- and the rest of public stay invisible to it.
--
-- rencana_ro is created by hand, not by a migration, so skip on databases
-- where it does not exist (local, branches).
set lock_timeout = '5s';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rencana_ro') then
    drop policy if exists confessions_ro_read on public.confessions;
    create policy confessions_ro_read on public.confessions
      for select to rencana_ro using (true);

    drop policy if exists universities_ro_read on public.universities;
    create policy universities_ro_read on public.universities
      for select to rencana_ro using (true);
  end if;
end $$;
