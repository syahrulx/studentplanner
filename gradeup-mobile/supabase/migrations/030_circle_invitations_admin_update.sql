-- Allow circle admins (inviter) to re-send / upsert invitations.
-- Required because PostgREST upsert uses DO UPDATE and needs an UPDATE policy.

drop policy if exists "Circle admins can update invites" on public.circle_invitations;
create policy "Circle admins can update invites"
on public.circle_invitations for update
using (
  auth.uid() = inviter_id
  and exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = circle_invitations.circle_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  )
)
with check (
  auth.uid() = inviter_id
  and exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = circle_invitations.circle_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  )
);

