-- SOW imports and staged extraction items
-- Also ensure a private storage bucket named "sow-files" exists.
-- Dashboard path: Storage -> Create bucket -> sow-files (Private).

create table if not exists public.sow_imports (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'review_ready', 'saved', 'failed')),
  error_message text,
  extracted_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.sow_import_items (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  sow_import_id text not null,
  item_type text not null check (item_type in ('subject', 'task')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (id, user_id),
  foreign key (sow_import_id, user_id) references public.sow_imports(id, user_id) on delete cascade
);

alter table public.sow_imports enable row level security;
alter table public.sow_import_items enable row level security;

drop policy if exists "Users can manage own sow_imports" on public.sow_imports;
create policy "Users can manage own sow_imports"
  on public.sow_imports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own sow_import_items" on public.sow_import_items;
create policy "Users can manage own sow_import_items"
  on public.sow_import_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_sow_imports_user_created on public.sow_imports(user_id, created_at desc);
create index if not exists idx_sow_import_items_user_import on public.sow_import_items(user_id, sow_import_id);

