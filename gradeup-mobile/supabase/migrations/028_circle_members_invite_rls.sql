-- Allow circle admins to add/invite members (insert into circle_members for other users).
-- Keeps self-join working as before.

drop policy if exists "Users can join circles" on public.circle_members;

create policy "Users can join circles"
on public.circle_members for insert
with check (
  auth.uid() = user_id
  or exists (
    select 1
    from public.circle_members cm_admin
    where cm_admin.circle_id = circle_members.circle_id
      and cm_admin.user_id = auth.uid()
      and cm_admin.role = 'admin'
  )
);

