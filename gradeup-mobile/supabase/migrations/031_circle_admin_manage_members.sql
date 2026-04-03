-- Circle creator/admin can manage circle membership:
-- - update member rows (e.g., roles)
-- - delete member rows (remove users)

drop policy if exists "Members can update" on public.circle_members;
create policy "Members can update"
on public.circle_members for update
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.circle_members cm_admin
    where cm_admin.circle_id = circle_members.circle_id
      and cm_admin.user_id = auth.uid()
      and cm_admin.role = 'admin'
  )
  or exists (
    select 1
    from public.circles c
    where c.id = circle_members.circle_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists "Members can leave circles" on public.circle_members;
create policy "Members can leave circles"
on public.circle_members for delete
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.circle_members cm_admin
    where cm_admin.circle_id = circle_members.circle_id
      and cm_admin.user_id = auth.uid()
      and cm_admin.role = 'admin'
  )
  or exists (
    select 1
    from public.circles c
    where c.id = circle_members.circle_id
      and c.created_by = auth.uid()
  )
);

