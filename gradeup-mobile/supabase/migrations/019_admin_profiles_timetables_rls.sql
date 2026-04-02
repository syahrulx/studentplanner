-- Let authenticated admins read/list users and timetables via PostgREST (admin-web)
-- without Edge Functions. Policies OR with existing per-user rules.

drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read"
on public.profiles for select
to authenticated
using (public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "timetable_entries_admin_select" on public.timetable_entries;
create policy "timetable_entries_admin_select"
on public.timetable_entries for select
to authenticated
using (public.is_admin());

drop policy if exists "timetable_entries_admin_delete" on public.timetable_entries;
create policy "timetable_entries_admin_delete"
on public.timetable_entries for delete
to authenticated
using (public.is_admin());
