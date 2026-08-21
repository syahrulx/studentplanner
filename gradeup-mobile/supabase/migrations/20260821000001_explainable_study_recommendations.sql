-- Explainable study recommendations: additive, user-owned data only.
-- IMPORTANT: This migration is intentionally not applied automatically.

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

-- Composite ownership-preserving reference. Deleting a parent removes only its
-- own user's breakdown steps; it can never cross account boundaries.
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
