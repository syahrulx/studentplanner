-- =============================================================================
-- AVATARS STORAGE BUCKET SETUP
-- Run this in your Supabase SQL Editor to enable profile picture uploads.
-- =============================================================================

-- 1. Create the bucket (if it doesn't exist)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 2. Drop existing policies to be safe (idempotent)
drop policy if exists "Avatar images are publicly accessible." on storage.objects;
drop policy if exists "Anyone can upload an avatar." on storage.objects;
drop policy if exists "Users can update their own avatar." on storage.objects;
drop policy if exists "Users can delete their own avatar." on storage.objects;

-- 3. Create policies
-- Allow public read access to all avatars
create policy "Avatar images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- Allow authenticated users to upload their own avatars
create policy "Anyone can upload an avatar."
  on storage.objects for insert
  with check ( bucket_id = 'avatars' and auth.role() = 'authenticated' );

-- Allow users to update their own avatars
create policy "Users can update their own avatar."
  on storage.objects for update
  using ( bucket_id = 'avatars' and auth.uid() = owner )
  with check ( bucket_id = 'avatars' and auth.uid() = owner );

-- Allow users to delete their own avatars
create policy "Users can delete their own avatar."
  on storage.objects for delete
  using ( bucket_id = 'avatars' and auth.uid() = owner );
