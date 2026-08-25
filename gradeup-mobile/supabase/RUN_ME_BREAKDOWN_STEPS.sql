-- ═══════════════════════════════════════════════════════════════════════════
--  Breakdown steps — schema the step feature depends on.
--
--  This is migration 20260821000001_explainable_study_recommendations.sql.
--  Its own header says "intentionally not applied automatically", so it very
--  likely has never been run on production.
--
--  Run the WHOLE file in Supabase Dashboard → SQL Editor → Run.
--  SAFE TO RE-RUN — every statement is idempotent (add column if not exists,
--  drop-then-create constraint/policy, create table if not exists).
--  No existing row is modified or deleted.
--
--  PART 2 at the bottom prints a PASS/FAIL report. Read that output.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PART 1 — the schema
--
-- Why this matters: taskDb.upsertTask() sends parent_task_id, step_order and
-- estimated_minutes on EVERY task write, not just steps. If these columns are
-- missing, every task save fails, the offline queue retries forever, and the
-- app shows tasks that were never actually stored — they'd vanish on reinstall
-- or on a second device.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists parent_task_id text,
  add column if not exists step_order integer,
  add column if not exists estimated_minutes integer;

alter table public.tasks
  drop constraint if exists tasks_parent_not_self,
  add constraint tasks_parent_not_self
    check (parent_task_id is null or parent_task_id <> id),
  drop constraint if exists tasks_step_order_range,
  add constraint tasks_step_order_range
    check (step_order is null or step_order between 0 and 100),
  drop constraint if exists tasks_estimated_minutes_range,
  add constraint tasks_estimated_minutes_range
    check (estimated_minutes is null or estimated_minutes between 5 and 1440);

-- Composite reference preserves ownership: deleting a parent removes only that
-- same user's steps, never anything across account boundaries.
alter table public.tasks
  drop constraint if exists tasks_parent_task_fk,
  add constraint tasks_parent_task_fk
    foreign key (parent_task_id, user_id)
    references public.tasks (id, user_id)
    on delete cascade;

create index if not exists tasks_user_parent_step_idx
  on public.tasks (user_id, parent_task_id, step_order)
  where parent_task_id is not null;

comment on column public.tasks.parent_task_id is
  'Optional parent task for a user-authored breakdown step.';
comment on column public.tasks.step_order is
  'Zero-based display order of a breakdown step.';
comment on column public.tasks.estimated_minutes is
  'Optional planning estimate. It is never treated as measured study time.';

-- Feedback table: records that a recommendation was accepted or dismissed, so
-- the same suggestion is not shown repeatedly on the same day.
create table if not exists public.study_recommendation_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_key text not null,
  rule_id text not null,
  related_task_id text,
  status text not null check (status in ('dismissed', 'accepted')),
  shown_for_date date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, recommendation_key)
);

create index if not exists study_recommendation_feedback_user_date_idx
  on public.study_recommendation_feedback (user_id, shown_for_date desc);

alter table public.study_recommendation_feedback enable row level security;

drop policy if exists "recommendation feedback select own" on public.study_recommendation_feedback;
create policy "recommendation feedback select own"
  on public.study_recommendation_feedback for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "recommendation feedback insert own" on public.study_recommendation_feedback;
create policy "recommendation feedback insert own"
  on public.study_recommendation_feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "recommendation feedback update own" on public.study_recommendation_feedback;
create policy "recommendation feedback update own"
  on public.study_recommendation_feedback for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "recommendation feedback delete own" on public.study_recommendation_feedback;
create policy "recommendation feedback delete own"
  on public.study_recommendation_feedback for delete
  to authenticated
  using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — VERIFICATION. Everything should say PASS.
-- ═══════════════════════════════════════════════════════════════════════════

select
  '1. tasks.parent_task_id exists' as check,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'parent_task_id'
  ) then 'PASS' else 'FAIL' end as result

union all select
  '2. tasks.step_order exists',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'step_order'
  ) then 'PASS' else 'FAIL' end

union all select
  '3. tasks.estimated_minutes exists',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'estimated_minutes'
  ) then 'PASS' else 'FAIL' end

union all select
  '4. study_recommendation_feedback table exists',
  case when exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'study_recommendation_feedback'
  ) then 'PASS' else 'FAIL' end

union all select
  '5. breakdown steps currently stored',
  coalesce((select count(*)::text from public.tasks where parent_task_id is not null), '0')
    || ' step row(s) in the database'

union all select
  '6. steps have their own spread dates',
  case
    when (select count(*) from public.tasks where parent_task_id is not null) = 0
      then 'INFO - no steps stored yet, nothing to check'
    when exists (
      select 1
      from public.tasks step
      join public.tasks parent
        on parent.id = step.parent_task_id and parent.user_id = step.user_id
      where step.parent_task_id is not null
        and step.due_date <> parent.due_date
    ) then 'PASS - at least one step has its own date'
    else 'INFO - every step still shares its parent date (old breakdowns; use the Spread dates button)'
  end

order by 1;
