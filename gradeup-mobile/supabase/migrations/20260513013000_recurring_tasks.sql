-- =============================================================================
-- Recurring (repeating) tasks — "To Do" category support.
--
-- When the user picks "To Do" in Add Task they can now toggle "Repeat" and pick
-- which weekdays the task fires on. There is no single due date for these
-- tasks; instead, `repeat_days` holds the Postgres-DOW integers (0=Sun..6=Sat)
-- of the days the task should appear on, and `repeat_notify` controls whether
-- a local weekday notification fires at `due_time` on each of those days.
--
-- Completion is tracked per occurrence in `task_completions` so ticking off
-- today's "Submit weekly report" doesn't make next Monday's instance vanish.
-- =============================================================================

-- ── tasks: new columns ─────────────────────────────────────────────────────
alter table public.tasks
  add column if not exists repeat_days int[] not null default '{}'::int[],
  add column if not exists repeat_notify boolean not null default false;

-- Guard the dow integers to 0..6 so bad client writes can't poison the table.
-- CHECK constraints can't use subqueries, so we lean on array operators:
--   repeat_days <@ ARRAY[0..6]  →  every element is in {0,1,2,3,4,5,6}
-- which is both stricter and faster than an unnest()/bool_and() subquery.
alter table public.tasks
  drop constraint if exists tasks_repeat_days_dow_range;
alter table public.tasks
  add constraint tasks_repeat_days_dow_range
  check (
    repeat_days = '{}'::int[]
    or (
      coalesce(array_length(repeat_days, 1), 0) between 1 and 7
      and repeat_days <@ array[0, 1, 2, 3, 4, 5, 6]
    )
  );

comment on column public.tasks.repeat_days is
  'When non-empty, this task is recurring. Integers are Postgres DOW (0=Sun..6=Sat).';
comment on column public.tasks.repeat_notify is
  'If true, schedule local notifications on each repeat_days weekday at due_time.';

-- Quick weekday lookups for "show today's recurring tasks".
create index if not exists tasks_repeat_days_gin
  on public.tasks using gin (repeat_days);

-- ── task_completions: per-occurrence done state ────────────────────────────
create table if not exists public.task_completions (
  task_id          text         not null,
  user_id          uuid         not null references auth.users(id) on delete cascade,
  occurrence_date  date         not null,
  completed_at     timestamptz  not null default now(),
  primary key (task_id, user_id, occurrence_date),
  -- Composite FK so deleting the task also deletes its completion history.
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);

create index if not exists task_completions_user_date_idx
  on public.task_completions (user_id, occurrence_date);

alter table public.task_completions enable row level security;

drop policy if exists "task_completions select own" on public.task_completions;
create policy "task_completions select own"
  on public.task_completions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "task_completions insert own" on public.task_completions;
create policy "task_completions insert own"
  on public.task_completions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "task_completions delete own" on public.task_completions;
create policy "task_completions delete own"
  on public.task_completions for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.task_completions is
  'Per-occurrence completion records for recurring tasks. One row per (task, user, date) the user has marked done.';
