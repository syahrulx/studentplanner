-- Per-plan marketing / feature bullets: editable by admins, readable by signed-in users (for in-app profile copy).

create table if not exists public.subscription_plan_features (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('free', 'plus', 'pro')),
  label text not null,
  enabled boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists subscription_plan_features_tier_sort_idx
  on public.subscription_plan_features (tier, sort_order);

alter table public.subscription_plan_features enable row level security;

drop policy if exists "subscription_plan_features_select_authenticated" on public.subscription_plan_features;
create policy "subscription_plan_features_select_authenticated"
  on public.subscription_plan_features for select
  to authenticated
  using (true);

drop policy if exists "subscription_plan_features_admin_write" on public.subscription_plan_features;
create policy "subscription_plan_features_admin_write"
  on public.subscription_plan_features for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "subscription_plan_features_admin_update" on public.subscription_plan_features;
create policy "subscription_plan_features_admin_update"
  on public.subscription_plan_features for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "subscription_plan_features_admin_delete" on public.subscription_plan_features;
create policy "subscription_plan_features_admin_delete"
  on public.subscription_plan_features for delete
  to authenticated
  using (public.is_admin());

-- Seed defaults once (matches original product copy).
do $$
begin
  if exists (select 1 from public.subscription_plan_features limit 1) then
    return;
  end if;
  insert into public.subscription_plan_features (tier, label, enabled, sort_order) values
    ('free', 'Weekly planner, timetable, and deadlines with reminders', true, 0),
    ('free', 'Notes, flashcards, academic calendar, and semester progress', true, 1),
    ('free', 'University portal & MyStudent sync where supported', true, 2),
    ('free', 'Community: friends, circles, shared goals, and presence', true, 3),
    ('free', 'Location privacy (public, friends, circles, or off)', true, 4),
    ('free', 'Starter AI-assisted task extraction when the assistant is enabled', true, 5),
    ('plus', 'Everything in Free', true, 0),
    ('plus', 'Higher AI quota for Scheme-of-Work import and bulk extraction', true, 1),
    ('plus', 'Google Classroom linking and sync', true, 2),
    ('plus', 'Headroom for heavier collaboration as shared limits roll out', true, 3),
    ('pro', 'Everything in Plus', true, 0),
    ('pro', 'Maximum AI usage for extraction and future assistant features', true, 1),
    ('pro', 'Early access to new premium tools', true, 2),
    ('pro', 'Priority support channel when offered', true, 3);
end $$;
