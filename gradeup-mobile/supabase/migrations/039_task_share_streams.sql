create table public.task_share_streams (
    id uuid not null default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    recipient_id uuid not null references auth.users(id) on delete cascade,
    enabled boolean not null default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint task_share_streams_pkey primary key (id),
    constraint uq_task_share_stream unique (owner_id, recipient_id)
);

alter table public.task_share_streams enable row level security;

create policy "Users can select their own task_share_streams (owner or recipient)"
on public.task_share_streams
for select
using (auth.uid() = owner_id or auth.uid() = recipient_id);

create policy "Users can insert task_share_streams for themselves"
on public.task_share_streams
for insert
with check (auth.uid() = owner_id);

create policy "Users can update their own task_share_streams"
on public.task_share_streams
for update
using (auth.uid() = owner_id);

create policy "Users can delete their own task_share_streams"
on public.task_share_streams
for delete
using (auth.uid() = owner_id);

