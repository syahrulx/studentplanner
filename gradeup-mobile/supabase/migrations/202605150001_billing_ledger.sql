-- Recovered on 2026-09-23 from supabase_migrations.schema_migrations.
-- This migration was applied to production through the CLI from a checkout
-- whose file was never committed; the statements below are the recorded ones,
-- verbatim, so the repo and the history table agree. Version kept as-is.

create table if not exists public.billing_webhook_events (
  id text primary key,
  event text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  user_id uuid references public.profiles(id) on delete set null,
  plan text check (plan in ('free', 'plus', 'pro') or plan is null),
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.billing_subscriptions (
  id text primary key,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  plan text check (plan in ('plus', 'pro') or plan is null),
  status text,
  cancel_at_cycle_end boolean not null default false,
  has_scheduled_changes boolean not null default false,
  schedule_change_at text,
  current_end timestamptz,
  charge_at timestamptz,
  ended_at timestamptz,
  raw jsonb,
  created_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_payments (
  id text primary key,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  plan text check (plan in ('plus', 'pro') or plan is null),
  type text not null default 'one-time' check (type in ('subscription', 'one-time')),
  subscription_id text,
  invoice_id text,
  order_id text,
  amount integer,
  currency text,
  status text,
  amount_refunded integer not null default 0,
  refund_status text,
  method text,
  description text,
  invoice_url text,
  captured_at timestamptz,
  raw jsonb,
  created_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_refunds (
  id text primary key,
  payment_id text,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  amount integer,
  currency text,
  status text,
  receipt text,
  speed_requested text,
  speed_processed text,
  arn text,
  rrn text,
  utr text,
  raw jsonb,
  created_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscription_cancellations (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  cancel_at_cycle_end boolean not null default true,
  current_end timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_webhook_events_event_idx on public.billing_webhook_events(event);

create index if not exists billing_payments_user_id_idx on public.billing_payments(user_id);

create index if not exists billing_payments_email_idx on public.billing_payments(lower(email));

create index if not exists billing_payments_subscription_id_idx on public.billing_payments(subscription_id);

create index if not exists billing_refunds_payment_id_idx on public.billing_refunds(payment_id);

create index if not exists billing_refunds_user_id_idx on public.billing_refunds(user_id);

create index if not exists billing_refunds_email_idx on public.billing_refunds(lower(email));

create index if not exists billing_subscriptions_user_id_idx on public.billing_subscriptions(user_id);

create index if not exists billing_subscriptions_email_idx on public.billing_subscriptions(lower(email));

create index if not exists billing_subscription_cancellations_user_id_idx on public.billing_subscription_cancellations(user_id);

alter table public.billing_webhook_events enable row level security;

alter table public.billing_payments enable row level security;

alter table public.billing_refunds enable row level security;

alter table public.billing_subscriptions enable row level security;

alter table public.billing_subscription_cancellations enable row level security;
