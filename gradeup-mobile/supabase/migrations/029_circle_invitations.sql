-- Circle invitations: invitee can accept/reject; membership is added on accept (handled by client).

create table if not exists public.circle_invitations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (circle_id, invitee_id)
);

alter table public.circle_invitations enable row level security;

drop policy if exists "Invitee can read circle invitations" on public.circle_invitations;
create policy "Invitee can read circle invitations"
on public.circle_invitations for select
using (auth.uid() = invitee_id);

drop policy if exists "Invitee can respond to circle invitations" on public.circle_invitations;
create policy "Invitee can respond to circle invitations"
on public.circle_invitations for update
using (auth.uid() = invitee_id)
with check (auth.uid() = invitee_id and status in ('pending', 'accepted', 'rejected'));

drop policy if exists "Circle admins can invite" on public.circle_invitations;
create policy "Circle admins can invite"
on public.circle_invitations for insert
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

