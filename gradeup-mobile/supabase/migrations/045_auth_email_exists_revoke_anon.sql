-- Revoke anonymous access to auth_email_exists to prevent email enumeration.
-- Only authenticated users can check if an email exists.
-- This prevents attackers from scripting email enumeration attacks.

revoke execute on function public.auth_email_exists(text) from anon;

-- Only authenticated users can use this function
-- (it's still needed for the login flow to distinguish "wrong password" vs "no account")
grant execute on function public.auth_email_exists(text) to authenticated;

comment on function public.auth_email_exists(text) is
  'Returns whether an auth.users row exists for this email. Restricted to authenticated users only (no anonymous access).';
