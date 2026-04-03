-- Fix circle_members RLS to avoid self-referential policy that can trigger
-- \"infinite recursion detected in policy for relation 'circle_members'\".
-- New rule: users can read their own membership rows; circles RLS continues
-- to control which circles a user can see.

drop policy if exists \"Members can read circle members\" on public.circle_members;

create policy \"Members can read circle members\"
on public.circle_members for select
using (auth.uid() = user_id);

