-- Only service role and is_admin() may change subscription_plan from the client.
-- Removes the name-based preview bypass (is_subscription_preview_user).

create or replace function public.profiles_lock_subscription_plan_non_admin()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.subscription_plan := 'free';
    return new;
  end if;
  new.subscription_plan := old.subscription_plan;
  return new;
end;
$$;

drop function if exists public.is_subscription_preview_user();
