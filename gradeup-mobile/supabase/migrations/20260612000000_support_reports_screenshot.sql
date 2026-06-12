-- =============================================================================
-- Migration: Add screenshot_url to support_reports and create support-screenshots bucket
-- =============================================================================

-- Add screenshot_url column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_reports' and column_name = 'screenshot_url'
  ) then
    alter table public.support_reports add column screenshot_url text;
  end if;
end $$;

-- Create support-screenshots bucket
insert into storage.buckets (id, name, public)
values ('support-screenshots', 'support-screenshots', true)
on conflict (id) do update set public = true;

-- Anyone authenticated can upload
DROP POLICY IF EXISTS "Authenticated users can upload support screenshots" ON storage.objects;
CREATE POLICY "Authenticated users can upload support screenshots"
  on storage.objects for insert
  with check (bucket_id = 'support-screenshots' and auth.uid() is not null);

-- Public read
DROP POLICY IF EXISTS "Public read support screenshots" ON storage.objects;
CREATE POLICY "Public read support screenshots"
  on storage.objects for select
  using (bucket_id = 'support-screenshots');

-- Reporter can delete own uploads (path starts with their user id)
DROP POLICY IF EXISTS "Users can delete own support screenshots" ON storage.objects;
CREATE POLICY "Users can delete own support screenshots"
  on storage.objects for delete
  using (bucket_id = 'support-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

-- Admin access
DROP POLICY IF EXISTS "Admins can manage support screenshots" ON storage.objects;
CREATE POLICY "Admins can manage support screenshots"
  on storage.objects for all
  using (bucket_id = 'support-screenshots' and public.is_admin());
