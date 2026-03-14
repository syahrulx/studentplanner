-- =============================================================================
-- Community Feature — Profiles Table Migration
-- Run this in Supabase SQL Editor to add missing columns to profiles.
-- =============================================================================

-- Add new columns for community features
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists faculty text;
alter table public.profiles add column if not exists course text;
alter table public.profiles add column if not exists class_group text;
alter table public.profiles add column if not exists location_visibility text not null default 'friends'
  check (location_visibility in ('public', 'friends', 'off'));

-- Drop local policy if exists
drop policy if exists "Authenticated users can read profiles" on public.profiles;

-- Allow authenticated users to read other profiles (needed for friend search/suggestions)
create policy "Authenticated users can read profiles"
  on public.profiles for select
  using (auth.uid() is not null);
