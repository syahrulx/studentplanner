-- Recovered on 2026-09-23 from supabase_migrations.schema_migrations.
-- This migration was applied to production through the CLI from a checkout
-- whose file was never committed; the statements below are the recorded ones,
-- verbatim, so the repo and the history table agree. Version kept as-is.

create table if not exists public.grade_assessments (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  name text not null,
  weight numeric not null check (weight > 0 and weight <= 100),
  score numeric,
  max_score numeric not null default 100 check (max_score > 0),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create index if not exists grade_assessments_user_course_idx
  on public.grade_assessments (user_id, course_id);

alter table public.grade_assessments enable row level security;

drop policy if exists "Users manage their grade assessments" on public.grade_assessments;

create policy "Users manage their grade assessments"
  on public.grade_assessments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.study_sessions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text,
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  studied_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

create index if not exists study_sessions_user_date_idx
  on public.study_sessions (user_id, studied_on desc);

alter table public.study_sessions enable row level security;

drop policy if exists "Users manage their study sessions" on public.study_sessions;

create policy "Users manage their study sessions"
  on public.study_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.user_productivity_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_grade numeric not null default 75,
  daily_digest boolean not null default true,
  weekly_digest boolean not null default true,
  deadline_reminders boolean not null default true,
  timetable_reminders boolean not null default true,
  reminder_lead_hours integer not null default 24,
  insight_cards text[] not null default array[
    'study_time',
    'completed_tasks',
    'overdue_trend',
    'upcoming_workload',
    'subject_progress'
  ]::text[],
  updated_at timestamptz not null default now()
);

alter table public.user_productivity_settings enable row level security;

drop policy if exists "Users manage their productivity settings"
  on public.user_productivity_settings;

create policy "Users manage their productivity settings"
  on public.user_productivity_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
