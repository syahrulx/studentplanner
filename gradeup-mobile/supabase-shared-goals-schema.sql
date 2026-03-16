-- =============================================================================
-- Shared Goals Schema for Gradeup Mobile
-- Run this in Supabase SQL Editor AFTER community schema is set up.
-- =============================================================================

-- Drop the table first if we need to recreate it because we are changing foreign keys
drop table if exists public.shared_goals cascade;

create table public.shared_goals (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  local_task_id text not null,
  title text not null,
  share_type text not null check (share_type in ('task', 'subject')),
  course_id text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shared_goals enable row level security;

-- Drop existing policies
drop policy if exists "Users can read own shared goals" on public.shared_goals;
drop policy if exists "Users can create shared goals" on public.shared_goals;
drop policy if exists "Users can update own shared goals" on public.shared_goals;
drop policy if exists "Users can delete own shared goals" on public.shared_goals;

-- Users can see shared goals they created or were invited to
create policy "Users can read own shared goals"
  on public.shared_goals for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Users can create shared goals (inviting a friend)
create policy "Users can create shared goals"
  on public.shared_goals for insert
  with check (auth.uid() = user_id);

-- Both partners can update:
-- friend_id can accept/reject
-- user_id can mark as completed
create policy "Users can update own shared goals"
  on public.shared_goals for update
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Creator can delete
create policy "Users can delete own shared goals"
  on public.shared_goals for delete
  using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists idx_shared_goals_user on public.shared_goals(user_id);
create index if not exists idx_shared_goals_friend on public.shared_goals(friend_id);
create index if not exists idx_shared_goals_status on public.shared_goals(status);

-- Function to auto-update updated_at
create or replace function update_shared_goals_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_shared_goals_updated_at on public.shared_goals;
create trigger update_shared_goals_updated_at
  before update on public.shared_goals
  for each row execute procedure update_shared_goals_updated_at();

-- Note on Notifications:
-- When a user inserts a shared_goal, the client app should also insert a row 
-- into public.quick_reactions so the friend gets notified of the pledge request.
