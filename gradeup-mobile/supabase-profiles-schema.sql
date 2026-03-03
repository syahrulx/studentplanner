-- Run this in Supabase SQL Editor first (before study schema).
-- Creates the profiles table and a trigger that inserts a profile row on every sign-up
-- (so name/university from sign-up metadata appear in profiles even when email confirmation is on).

create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  name text,
  university text,
  updated_at timestamptz not null default now(),
  primary key (id)
);

alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can insert their own profile (e.g. on sign-up)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on sign-up (runs with trigger privileges, so no RLS issue)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, university, updated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'university', null),
    now()
  )
  on conflict (id) do update set
    name = coalesce(excluded.name, profiles.name),
    university = coalesce(excluded.university, profiles.university),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
