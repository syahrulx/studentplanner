-- Keep subscription access and RevenueCat billing state as separate facts.
--
-- `subscription_plan` continues to control app access (free / plus / pro).
-- The fields below explain *why* that access exists (trial, active, promotional,
-- cancelled, etc.) without storing receipts or full webhook payloads.

alter table public.profiles
  add column if not exists subscription_status text not null default 'free',
  add column if not exists subscription_period_type text,
  add column if not exists subscription_product_id text,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists subscription_store text,
  add column if not exists subscription_environment text,
  add column if not exists subscription_price numeric,
  add column if not exists subscription_currency text,
  add column if not exists subscription_updated_at timestamptz,
  add column if not exists revenuecat_app_user_id text,
  add column if not exists last_revenuecat_event_id text;

alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
  add constraint profiles_subscription_status_check check (
    subscription_status in (
      'free', 'trial', 'introductory', 'active', 'promotional', 'prepaid',
      'cancelled', 'billing_issue', 'paused', 'temporary', 'expired',
      'refunded', 'unknown'
    )
  );

-- Existing paid rows predate reliable billing metadata. Marking them "unknown"
-- is safer than falsely claiming that they paid or are on a trial.
update public.profiles
set subscription_status = case
  when subscription_plan = 'free' then 'free'
  else 'unknown'
end
where subscription_updated_at is null;

create index if not exists profiles_revenuecat_app_user_id_idx
  on public.profiles (revenuecat_app_user_id)
  where revenuecat_app_user_id is not null;

-- Prevent mobile clients from self-asserting billing metadata. Service-role
-- webhook calls and admin operations are still allowed, matching the existing
-- subscription_plan protection.
create or replace function public.profiles_lock_subscription_billing_non_admin()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.subscription_status := 'free';
    new.subscription_period_type := null;
    new.subscription_product_id := null;
    new.subscription_expires_at := null;
    new.subscription_store := null;
    new.subscription_environment := null;
    new.subscription_price := null;
    new.subscription_currency := null;
    new.subscription_updated_at := null;
    new.revenuecat_app_user_id := null;
    new.last_revenuecat_event_id := null;
    return new;
  end if;

  new.subscription_status := old.subscription_status;
  new.subscription_period_type := old.subscription_period_type;
  new.subscription_product_id := old.subscription_product_id;
  new.subscription_expires_at := old.subscription_expires_at;
  new.subscription_store := old.subscription_store;
  new.subscription_environment := old.subscription_environment;
  new.subscription_price := old.subscription_price;
  new.subscription_currency := old.subscription_currency;
  new.subscription_updated_at := old.subscription_updated_at;
  new.revenuecat_app_user_id := old.revenuecat_app_user_id;
  new.last_revenuecat_event_id := old.last_revenuecat_event_id;
  return new;
end;
$$;

drop trigger if exists profiles_lock_subscription_billing on public.profiles;
create trigger profiles_lock_subscription_billing
before insert or update on public.profiles
for each row execute function public.profiles_lock_subscription_billing_non_admin();

-- Minimal, service-role-only webhook audit. No receipt, raw payload, email,
-- or payment method is stored here.
create table if not exists public.revenuecat_webhook_events (
  event_id text primary key,
  event_type text not null,
  event_app_user_id text,
  resolved_user_id uuid references public.profiles(id) on delete set null,
  product_id text,
  entitlement_ids text[] not null default '{}',
  derived_plan text check (derived_plan is null or derived_plan in ('free', 'plus', 'pro')),
  period_type text,
  environment text,
  store text,
  price numeric,
  currency text,
  processing_status text not null check (
    processing_status in ('received', 'processed', 'unmatched', 'conflict', 'rejected', 'ignored')
  ),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.revenuecat_webhook_events enable row level security;
revoke all on public.revenuecat_webhook_events from anon, authenticated;

create index if not exists revenuecat_webhook_events_resolved_user_idx
  on public.revenuecat_webhook_events (resolved_user_id, received_at desc);

create index if not exists revenuecat_webhook_events_processing_status_idx
  on public.revenuecat_webhook_events (processing_status, received_at desc);

-- Reconciliation changes are reversible and attributable. This table records
-- only the old/new tier and reason; it contains no receipt or payment data.
create table if not exists public.subscription_reconciliation_audit (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  old_plan text not null check (old_plan in ('free', 'plus', 'pro')),
  new_plan text not null check (new_plan in ('free', 'plus', 'pro')),
  reason text not null,
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.subscription_reconciliation_audit enable row level security;
revoke all on public.subscription_reconciliation_audit from anon, authenticated;

create index if not exists subscription_reconciliation_audit_user_idx
  on public.subscription_reconciliation_audit (user_id, created_at desc);
