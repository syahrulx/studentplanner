-- Let named internal preview users change their own subscription_plan from the app (same as admin bypass).

create or replace function public.is_subscription_preview_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        (lower(trim(coalesce(p.name, ''))) like '%muhammad%' and lower(trim(coalesce(p.name, ''))) like '%izwan%')
        or (lower(trim(coalesce(p.name, ''))) like '%muhammad%' and lower(trim(coalesce(p.name, ''))) like '%syahrul%')
      )
  );
$$;

create or replace function public.profiles_lock_subscription_plan_non_admin()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() or auth.uid() is null or public.is_subscription_preview_user() then
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
