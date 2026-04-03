-- Subscription plan for billing / feature gating. Existing rows become free.

alter table public.profiles add column if not exists subscription_plan text;

update public.profiles
set subscription_plan = 'free'
where subscription_plan is null or trim(subscription_plan) = '';

alter table public.profiles alter column subscription_plan set default 'free';
alter table public.profiles alter column subscription_plan set not null;

alter table public.profiles drop constraint if exists profiles_subscription_plan_check;
alter table public.profiles
  add constraint profiles_subscription_plan_check
  check (subscription_plan in ('free', 'plus', 'pro'));
