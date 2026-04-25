-- Admin AI token controls
--
-- Adds two operations the admin panel needs:
--   1. Reset a user's current-month AI token usage (delete their rows in
--      ai_token_usage for the current UTC month) — lets an admin "restore"
--      a free user who hit the cap without touching their plan.
--   2. Override the user's monthly cap with a custom bigint — lets an admin
--      bump a specific free user to, e.g., 100k/month without upgrading the
--      plan. Null/0 removes the override and falls back to the plan default.
--
-- All writes go through SECURITY DEFINER RPCs that check public.is_admin()
-- so we don't rely on the caller's RLS alone. A trigger additionally locks
-- ai_token_limit_override to admin-only writes (defense in depth, mirrors
-- the subscription_plan lock from migration 037).

-- ── 1. Schema ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists ai_token_limit_override bigint;

comment on column public.profiles.ai_token_limit_override is
  'Admin-only per-user monthly AI token cap. NULL = use plan default.';

-- ── 2. Admin-only write trigger for ai_token_limit_override ──────────────
create or replace function public.profiles_lock_ai_token_limit_override_non_admin()
returns trigger
language plpgsql
as $$
begin
  -- Service role / backend (auth.uid() is null) and admins may write freely.
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.ai_token_limit_override := null;
    return new;
  end if;

  -- Regular users cannot change their own override.
  new.ai_token_limit_override := old.ai_token_limit_override;
  return new;
end;
$$;

drop trigger if exists trg_profiles_lock_ai_token_limit_override on public.profiles;
create trigger trg_profiles_lock_ai_token_limit_override
  before insert or update on public.profiles
  for each row execute function public.profiles_lock_ai_token_limit_override_non_admin();

-- ── 3. Reset current-month usage ─────────────────────────────────────────
create or replace function public.admin_reset_user_monthly_tokens(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  with removed as (
    delete from public.ai_token_usage
     where user_id = p_user_id
       and created_at >= date_trunc('month', timezone('utc', now()))
    returning 1
  )
  select count(*) into v_deleted from removed;

  return v_deleted;
end;
$$;

grant execute on function public.admin_reset_user_monthly_tokens(uuid)
  to authenticated, service_role;

-- ── 4. Set / clear the per-user monthly cap override ─────────────────────
-- Passing NULL (or a non-positive number) clears the override so the user
-- falls back to their plan default.
create or replace function public.admin_set_user_token_limit(
  p_user_id uuid,
  p_limit bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_applied bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  if p_limit is null or p_limit <= 0 then
    v_applied := null;
  else
    v_applied := p_limit;
  end if;

  update public.profiles
     set ai_token_limit_override = v_applied
   where id = p_user_id;

  return coalesce(v_applied, -1);
end;
$$;

grant execute on function public.admin_set_user_token_limit(uuid, bigint)
  to authenticated, service_role;
