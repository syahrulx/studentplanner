-- Allow members to read other members within circles they belong to,
-- without triggering RLS recursion on circle_members.

create or replace function public.is_circle_member(p_circle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = p_circle_id
      and cm.user_id = p_user_id
  );
$$;

revoke all on function public.is_circle_member(uuid, uuid) from public;
grant execute on function public.is_circle_member(uuid, uuid) to authenticated;

drop policy if exists "Members can read circle members" on public.circle_members;
create policy "Members can read circle members"
on public.circle_members for select
using (public.is_circle_member(circle_members.circle_id, auth.uid()));

