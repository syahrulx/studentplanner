-- Planner subjects + tasks (used by coursesDb.ts and taskDb.ts).
-- Run via Supabase CLI or paste in SQL Editor if tables are missing.

create table if not exists public.user_courses (
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text not null,
  name text not null,
  credit_hours int not null default 3,
  workload jsonb not null default '[]'::jsonb,
  primary key (user_id, subject_id)
);

alter table public.user_courses enable row level security;

drop policy if exists "Users manage own user_courses" on public.user_courses;
create policy "Users manage own user_courses"
  on public.user_courses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id text not null,
  title text not null,
  type text not null,
  due_date text not null,
  due_time text not null,
  priority text not null,
  effort_hours numeric not null default 2,
  notes text not null default '',
  is_done boolean not null default false,
  deadline_risk text not null default 'Medium',
  suggested_week int not null default 1,
  source_message text,
  primary key (id, user_id)
);

alter table public.tasks enable row level security;

drop policy if exists "Users manage own tasks" on public.tasks;
create policy "Users manage own tasks"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
