create table if not exists public.saved_quizzes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  created_at timestamptz default now() not null,
  question_count integer not null default 0,
  source_type text not null,
  source_id text,
  quiz_type text,
  difficulty text,
  questions jsonb not null default '[]'::jsonb
);

-- Enable RLS
alter table public.saved_quizzes enable row level security;

-- Policies
create policy "Users can view their own saved quizzes"
  on public.saved_quizzes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own saved quizzes"
  on public.saved_quizzes for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own saved quizzes"
  on public.saved_quizzes for delete
  using (auth.uid() = user_id);

-- Index for faster queries by user
create index if not exists idx_saved_quizzes_user_id on public.saved_quizzes(user_id);
