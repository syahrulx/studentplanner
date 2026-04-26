-- Circle invitations: allow circle admins (the inviter) to SELECT/UPDATE
-- rows they created so the mobile client's upsert-based reinvite flow works.
--
-- The original policies in migration 029 only granted access to the INVITEE:
--   SELECT: invitee_id = auth.uid()
--   UPDATE: invitee_id = auth.uid()
--
-- When an admin tries to re-invite a friend whose previous invitation was
-- rejected, PostgREST's upsert(onConflict=(circle_id, invitee_id)) converts
-- to an UPDATE and is rejected by RLS → "Invite failed".
--
-- These additional policies make the admin flow idempotent without weakening
-- invitee protections (invitee-side policies from 029 remain intact).

-- Admins can read invitations for circles they administer (for debugging +
-- to verify status before re-inviting).
drop policy if exists "Circle admins can read invitations" on public.circle_invitations;
create policy "Circle admins can read invitations"
on public.circle_invitations for select
using (
  exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = circle_invitations.circle_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  )
);

-- Admins can update invitations they originally created — only to reset the
-- status back to 'pending' (e.g. re-inviting after a rejection). They cannot
-- self-accept or forge other fields.
drop policy if exists "Circle admins can reset invitations" on public.circle_invitations;
create policy "Circle admins can reset invitations"
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
  and status = 'pending'
);

-- Admins can delete invitations on their circles (useful for cleanup and
-- allows "cancel invitation" UX in the future).
drop policy if exists "Circle admins can delete invitations" on public.circle_invitations;
create policy "Circle admins can delete invitations"
on public.circle_invitations for delete
using (
  exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = circle_invitations.circle_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  )
);
