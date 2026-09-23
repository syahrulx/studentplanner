-- Recovered on 2026-09-23 from supabase_migrations.schema_migrations.
-- This migration was applied to production through the CLI from a checkout
-- whose file was never committed; the statements below are the recorded ones,
-- verbatim, so the repo and the history table agree. Version kept as-is.

-- Comments for community events, services and memos.
-- Confessions keep using their anonymous RPC-backed comment system.
create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists community_post_comments_post_created_idx
  on public.community_post_comments (post_id, created_at asc);

alter table public.community_post_comments enable row level security;

drop policy if exists "Authenticated users read community post comments"
  on public.community_post_comments;

create policy "Authenticated users read community post comments"
  on public.community_post_comments for select
  using (auth.uid() is not null);

drop policy if exists "Users create own community post comments"
  on public.community_post_comments;

create policy "Users create own community post comments"
  on public.community_post_comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own community post comments"
  on public.community_post_comments;

create policy "Users delete own community post comments"
  on public.community_post_comments for delete
  using (auth.uid() = user_id);
