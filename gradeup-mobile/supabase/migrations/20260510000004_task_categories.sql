-- Task categories managed by admin
create table if not exists public.task_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  icon        text,          -- optional emoji e.g. '📝'
  color       text,          -- optional hex e.g. '#3b82f6'
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Seed default categories (mirrors the old hardcoded TaskType enum)
insert into public.task_categories (name, icon, sort_order) values
  ('Assignment', '📝', 1),
  ('Quiz',       '❓', 2),
  ('Project',    '💼', 3),
  ('Lab',        '🔬', 4),
  ('Test',       '📋', 5),
  ('Exam',       '📚', 6)
on conflict (name) do nothing;

-- Keep updated_at fresh automatically
create or replace function public.set_task_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists task_categories_updated_at on public.task_categories;
create trigger task_categories_updated_at
  before update on public.task_categories
  for each row execute function public.set_task_categories_updated_at();

-- RLS: anyone can read active categories; only authenticated admins can write
alter table public.task_categories enable row level security;

create policy "task_categories_read_all"
  on public.task_categories for select
  using (true);

create policy "task_categories_admin_write"
  on public.task_categories for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
