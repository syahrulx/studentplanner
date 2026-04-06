-- Admin: allow authenticated admins to insert/update timetable rows (delete/select already exist).

drop policy if exists "timetable_entries_admin_insert" on public.timetable_entries;
create policy "timetable_entries_admin_insert"
on public.timetable_entries for insert
to authenticated
with check (public.is_admin());

drop policy if exists "timetable_entries_admin_update" on public.timetable_entries;
create policy "timetable_entries_admin_update"
on public.timetable_entries for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
