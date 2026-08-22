-- Nothing re-evaluates a user's effective plan when their provider facts
-- simply lapse: recompute_subscription_access only runs on RevenueCat webhook
-- events, Curlec webhook events, admin actions, or a web billing-page visit.
-- A user whose subscription expires with none of those firing keeps a paid
-- subscription_plan in profiles indefinitely. Sweep every currently-paid
-- profile once a day so expiry actually lands.

create or replace function public.sweep_subscription_access()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user record;
  v_count integer := 0;
begin
  for v_user in
    select id from public.profiles where subscription_plan in ('plus', 'pro')
  loop
    begin
      perform public.recompute_subscription_access(v_user.id);
      v_count := v_count + 1;
    exception when others then
      -- One bad row must not abort the whole sweep.
      raise warning 'sweep_subscription_access: user % failed: %', v_user.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$fn$;

revoke all on function public.sweep_subscription_access() from public, anon, authenticated;
grant execute on function public.sweep_subscription_access() to service_role;

create extension if not exists pg_cron;

-- 20:00 UTC = 04:00 MYT. cron.schedule upserts by job name, so re-running
-- this migration is safe.
select cron.schedule(
  'subscription-expiry-sweep',
  '0 20 * * *',
  'select public.sweep_subscription_access();'
);
