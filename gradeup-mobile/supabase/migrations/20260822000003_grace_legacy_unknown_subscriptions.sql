-- 20260811000001 backfilled pre-billing-truth paid profiles with
-- subscription_status='unknown', and the entitlement seed in 20260811000002
-- deliberately skipped them (no product/status proof). Those users therefore
-- hold a paid plan in profiles with no provider fact anywhere, and the first
-- recompute_subscription_access call for them (any RevenueCat event or admin
-- action) writes subscription_plan='free'.
--
-- Rather than fabricating a permanent provider fact for rows we cannot prove,
-- grant a 60-day admin grace entitlement: a genuine subscriber's real provider
-- reasserts itself within one billing cycle (RevenueCat renewal event or a
-- Curlec ledger row), while truly lapsed rows expire with the grace period.

insert into public.subscription_entitlements (
  user_id, provider, external_id, plan, status, period_type, product_id,
  store, environment, starts_at, expires_at, price, currency
)
select
  p.id,
  'admin',
  p.id::text,
  p.subscription_plan,
  'promotional',
  'PROMOTIONAL',
  'legacy-unknown-grace',
  'ADMIN',
  'INTERNAL',
  now(),
  now() + interval '60 days',
  0,
  null
from public.profiles p
where p.subscription_plan in ('plus', 'pro')
  and p.subscription_status = 'unknown'
  and not exists (
    select 1 from public.subscription_entitlements e where e.user_id = p.id
  )
  and not exists (
    select 1 from public.billing_subscriptions s where s.user_id = p.id
  )
  and not exists (
    select 1 from public.billing_payments bp where bp.user_id = p.id
  )
on conflict (user_id, provider) do nothing;

-- Recompute the affected users so profiles reflects the grace entitlement
-- (status 'promotional' with a real expiry) instead of the orphaned 'unknown'.
do $$
declare
  r record;
begin
  for r in
    select user_id
    from public.subscription_entitlements
    where provider = 'admin' and product_id = 'legacy-unknown-grace'
  loop
    perform public.recompute_subscription_access(r.user_id);
  end loop;
end;
$$;
