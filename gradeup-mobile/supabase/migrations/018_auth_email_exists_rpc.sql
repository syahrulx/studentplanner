-- Used after failed email/password sign-in to choose "Wrong password" vs "No account yet".
-- Allows email enumeration; grant only if that tradeoff is acceptable for your product.

create or replace function public.auth_email_exists(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users
    where email is not null
      and lower(trim(email)) = lower(trim(check_email))
  );
$$;

comment on function public.auth_email_exists(text) is
  'Returns whether an auth.users row exists for this email (case-insensitive).';

revoke all on function public.auth_email_exists(text) from public;
grant execute on function public.auth_email_exists(text) to anon, authenticated;
