create table if not exists shared_tasks (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  circle_id uuid references circles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  recipient_completed boolean not null default false,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shared_tasks_owner on shared_tasks(owner_id);
create index if not exists idx_shared_tasks_recipient on shared_tasks(recipient_id);
create index if not exists idx_shared_tasks_task on shared_tasks(task_id);
create index if not exists idx_shared_tasks_status on shared_tasks(status);

alter table shared_tasks enable row level security;

create policy "Users can view their own shared tasks"
  on shared_tasks for select
  using (auth.uid() = owner_id or auth.uid() = recipient_id);

create policy "Users can insert shared tasks they own"
  on shared_tasks for insert
  with check (auth.uid() = owner_id);

create policy "Recipients can update shared task status and completion"
  on shared_tasks for update
  using (auth.uid() = recipient_id or auth.uid() = owner_id);

-- Enable realtime for the shared_tasks table
alter publication supabase_realtime add table shared_tasks;
