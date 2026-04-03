-- Non-admins cannot set or change subscription_plan via PostgREST (only admins / service role).

create or replace function public.profiles_lock_subscription_plan_non_admin()
returns trigger
language plpgsql
as $$
begin
  -- Service role / internal inserts (no JWT subject) skip this lock so Edge Functions can manage plans.
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

drop trigger if exists profiles_lock_subscription_plan on public.profiles;
create trigger profiles_lock_subscription_plan
before insert or update on public.profiles
for each row
execute function public.profiles_lock_subscription_plan_non_admin();
