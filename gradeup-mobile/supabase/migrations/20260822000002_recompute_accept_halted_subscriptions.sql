-- The Curlec webhook (rencana web repo) intentionally defers demotion on
-- subscription.halted to give the user a payment-retry grace period, but this
-- function previously rejected the 'halted' status outright, so the very
-- recompute that webhook triggers dropped the user to free immediately.
-- Accept 'halted' rows while their paid period is still running
-- (current_end > now() already bounds the grace), surfacing them as
-- 'billing_issue' — the same status RevenueCat billing trouble maps to.
-- Everything else is unchanged from 20260811000002.

create or replace function public.recompute_subscription_access(p_user_id uuid)
returns table (
  subscription_plan text,
  subscription_status text,
  subscription_store text,
  subscription_environment text,
  subscription_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_selected record;
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  select candidate.*
  into v_selected
  from (
    -- RevenueCat and explicit admin grants are stored as provider facts.
    select
      e.plan,
      e.status,
      e.period_type,
      e.product_id,
      coalesce(e.store, upper(e.provider)) as store,
      e.environment,
      e.expires_at,
      e.price,
      e.currency,
      e.updated_at,
      case e.provider when 'admin' then 3 else 2 end as source_rank
    from public.subscription_entitlements e
    where e.user_id = p_user_id
      and e.plan in ('plus', 'pro')
      and e.status in (
        'trial', 'introductory', 'active', 'promotional', 'prepaid',
        'cancelled', 'billing_issue', 'temporary'
      )
      and (e.expires_at is null or e.expires_at > now())

    union all

    -- Curlec/Razorpay recurring access is valid only inside its paid period.
    select
      s.plan,
      case
        when lower(s.status) = 'cancelled' then 'cancelled'
        when lower(s.status) = 'halted' then 'billing_issue'
        else 'active'
      end,
      'SUBSCRIPTION',
      s.id,
      'CURLEC',
      'PRODUCTION',
      s.current_end,
      null::numeric,
      null::text,
      s.updated_at,
      2
    from public.billing_subscriptions s
    where s.user_id = p_user_id
      and s.plan in ('plus', 'pro')
      and lower(coalesce(s.status, '')) in (
        'active', 'authenticated', 'charged', 'pending', 'cancelled', 'halted'
      )
      and s.current_end > now()

    union all

    -- Each captured website charge grants one calendar month. This also acts
    -- as a safe fallback when a payment webhook arrives before its associated
    -- subscription entity. A fully refunded payment cannot grant access.
    select
      p.plan,
      case when p.type = 'subscription' then 'active' else 'prepaid' end,
      case when p.type = 'subscription' then 'SUBSCRIPTION' else 'ONE_TIME' end,
      p.id,
      'CURLEC',
      'PRODUCTION',
      coalesce(p.captured_at, p.created_at) + interval '1 month',
      p.amount::numeric / 100,
      p.currency,
      p.updated_at,
      2
    from public.billing_payments p
    where p.user_id = p_user_id
      and p.plan in ('plus', 'pro')
      and p.type in ('one-time', 'subscription')
      and lower(coalesce(p.status, '')) in ('captured', 'paid', 'success', 'successful', 'authorized')
      and coalesce(p.captured_at, p.created_at) + interval '1 month' > now()
      and coalesce(p.amount_refunded, 0) < coalesce(p.amount, 0)
      and lower(coalesce(p.refund_status, '')) not in ('full', 'refunded')
      and not exists (
        select 1
        from public.billing_refunds r
        where r.payment_id = p.id
          and lower(coalesce(r.status, '')) in ('processed', 'refunded')
          and coalesce(r.amount, 0) >= coalesce(p.amount, 0)
      )
  ) candidate
  order by
    case candidate.plan when 'pro' then 2 else 1 end desc,
    candidate.source_rank desc,
    candidate.expires_at desc nulls first,
    candidate.updated_at desc
  limit 1;

  if found then
    update public.profiles p
    set
      subscription_plan = v_selected.plan,
      subscription_status = v_selected.status,
      subscription_period_type = v_selected.period_type,
      subscription_product_id = v_selected.product_id,
      subscription_expires_at = v_selected.expires_at,
      subscription_store = v_selected.store,
      subscription_environment = v_selected.environment,
      subscription_price = v_selected.price,
      subscription_currency = v_selected.currency,
      subscription_updated_at = now(),
      updated_at = now()
    where p.id = p_user_id;
  else
    update public.profiles p
    set
      subscription_plan = 'free',
      subscription_status = 'free',
      subscription_period_type = null,
      subscription_product_id = null,
      subscription_expires_at = null,
      subscription_store = null,
      subscription_environment = null,
      subscription_price = null,
      subscription_currency = null,
      subscription_updated_at = now(),
      updated_at = now()
    where p.id = p_user_id;
  end if;

  return query
  select
    p.subscription_plan,
    p.subscription_status,
    p.subscription_store,
    p.subscription_environment,
    p.subscription_expires_at
  from public.profiles p
  where p.id = p_user_id;
end;
$$;

revoke all on function public.recompute_subscription_access(uuid) from public, anon, authenticated;
grant execute on function public.recompute_subscription_access(uuid) to service_role;
