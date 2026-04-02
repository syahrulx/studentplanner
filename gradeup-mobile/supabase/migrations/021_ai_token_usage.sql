-- AI token usage logging (for admin dashboard chart)
-- Stores OpenAI usage from chat/completions calls made by the mobile app.

create extension if not exists pgcrypto;

create table if not exists public.ai_token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'openai',
  model text,
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  created_at timestamptz not null default now()
);

alter table public.ai_token_usage enable row level security;

-- Users can insert only their own usage rows.
drop policy if exists "ai_usage_insert_own" on public.ai_token_usage;
create policy "ai_usage_insert_own"
on public.ai_token_usage for insert
to authenticated
with check (auth.uid() = user_id);

-- Users can view only their own usage.
drop policy if exists "ai_usage_select_own" on public.ai_token_usage;
create policy "ai_usage_select_own"
on public.ai_token_usage for select
to authenticated
using (auth.uid() = user_id);

-- Admins can view all usage rows.
drop policy if exists "ai_usage_select_admin" on public.ai_token_usage;
create policy "ai_usage_select_admin"
on public.ai_token_usage for select
to authenticated
using (public.is_admin());

