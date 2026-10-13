-- 20261013000007_user_planner_state.sql
--
-- Pinned tasks and "study done" ticks used to live only on the phone that set
-- them: pin a task on the phone and the website and the iPad did not know.
-- This table carries them across devices.
--
-- Own table, not profiles columns: friends can read parts of a profile, and
-- the study keys say when a student studies. Only the owner can read or write
-- a row here.
--
-- Safe to run more than once. Creates a new, empty table; changes no
-- existing data. Each list carries its own "last changed" time so the newest
-- change wins when two devices disagree.

create table if not exists public.user_planner_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pinned_task_ids text[] not null default '{}',
  pinned_updated_at timestamptz,
  completed_study_keys text[] not null default '{}',
  completed_updated_at timestamptz,
  constraint user_planner_state_pinned_max check (cardinality(pinned_task_ids) <= 10),
  constraint user_planner_state_completed_max check (cardinality(completed_study_keys) <= 1000)
);

alter table public.user_planner_state enable row level security;

drop policy if exists user_planner_state_own_select on public.user_planner_state;
create policy user_planner_state_own_select on public.user_planner_state
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_planner_state_own_insert on public.user_planner_state;
create policy user_planner_state_own_insert on public.user_planner_state
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_planner_state_own_update on public.user_planner_state;
create policy user_planner_state_own_update on public.user_planner_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.user_planner_state is
  'Per-student planner state synced across devices: pinned task ids and completed study-session keys. Owner-only.';
