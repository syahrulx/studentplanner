-- One call that answers "who is this person, and how much AI have they used".
--
-- The support screen shows a report without ever saying whether the person who
-- sent it pays, or whether they are near their AI limit. An admin answering
-- "the AI stopped working" had no way to see that the student had simply run
-- out, and no way to see it was a Pro user whose month had barely started.
--
-- Returns the limits as well as the usage, so the admin panel holds no copy of
-- the numbers. They are duplicated from
-- supabase/functions/_shared/planLimits.ts (DAILY_GENERATION_LIMITS) and
-- tokenLimit.ts (MONTHLY_TOKEN_LIMITS); those two files are what actually
-- enforce the limits, this one only reports. Change them and change this.

create or replace function public.admin_user_ai_summary(p_user_id uuid)
returns table (
  plan                  text,
  subscription_status   text,
  subscription_expires  timestamptz,
  period_type           text,
  monthly_tokens_used   bigint,
  monthly_token_limit   bigint,
  daily_requests_used   bigint,
  daily_request_limit   bigint,
  limit_is_override     boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan     text;
  v_override bigint;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select coalesce(p.subscription_plan, 'free'),
         nullif(p.ai_token_limit_override, 0)
    into v_plan, v_override
  from public.profiles p
  where p.id = p_user_id;

  if v_plan is null then
    v_plan := 'free';
  end if;
  -- An unknown plan string is treated as free, the same way normalizePlan does
  -- in the Edge Functions, so a typo in the column cannot hand out a big limit.
  if v_plan not in ('free', 'plus', 'pro') then
    v_plan := 'free';
  end if;

  return query
  select
    v_plan,
    pr.subscription_status,
    pr.subscription_expires_at,
    pr.subscription_period_type,
    -- Tokens this calendar month.
    coalesce((
      select sum(u.total_tokens)::bigint
      from public.ai_token_usage u
      where u.user_id = p_user_id
        and u.created_at >= date_trunc('month', now())
    ), 0),
    coalesce(v_override, case v_plan
      when 'pro'  then 1000000
      when 'plus' then 200000
      else 20000
    end)::bigint,
    -- Requests today. The three kinds below are work the app does for the
    -- student rather than something they asked for, so they do not count
    -- against the daily quota — the same exclusion the Edge Function applies.
    coalesce((
      select count(*)::bigint
      from public.ai_token_usage u
      where u.user_id = p_user_id
        and u.created_at >= date_trunc('day', now() at time zone 'utc')
        and u.kind not in ('pdf_text_extraction', 'quiz_repair', 'embedding')
    ), 0),
    (case v_plan
      when 'pro'  then 500
      when 'plus' then 100
      else 20
    end)::bigint,
    v_override is not null
  from public.profiles pr
  where pr.id = p_user_id;
end;
$$;

revoke all on function public.admin_user_ai_summary(uuid) from public, anon;
grant execute on function public.admin_user_ai_summary(uuid) to authenticated, service_role;
