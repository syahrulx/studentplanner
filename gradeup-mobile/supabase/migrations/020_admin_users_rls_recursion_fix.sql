-- Fix: infinite recursion detected in RLS policies on public.admin_users
-- Caused by a policy that queried public.admin_users from within its own policy.

-- A SECURITY DEFINER function allows reading the admin_users row without triggering RLS on itself.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.role = 'super_admin'
      and a.disabled = false
  );
$$;

-- Keep is_admin consistent (also security definer to avoid any future recursion).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.disabled = false
  );
$$;

drop policy if exists "admin_users_read_self" on public.admin_users;
create policy "admin_users_read_self"
on public.admin_users for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_super_admin()
);

-- admin_users_no_write stays unchanged (Edge Functions / service role only)
