-- Note attachments storage bucket and RLS policies.
-- Run this SQL in Supabase SQL Editor after creating the bucket.
--
-- Create the bucket (choose one):
--   A) Dashboard: Storage → New bucket → Name: note-attachments, Private.
--   B) From the app: call ensureNoteAttachmentsBucket() from src/lib/noteStorage.ts (e.g. on first use).
--
-- Then run the policies below so authenticated users can only access their own files (path: {user_id}/{note_id}/{filename}).

-- Allow users to upload to their own folder only (path prefix = auth.uid())
create policy "Users can upload own note attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

-- Allow users to read their own files
create policy "Users can read own note attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

-- Allow users to update their own files (e.g. replace)
create policy "Users can update own note attachments"
on storage.objects for update
to authenticated
using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (auth.uid())::text
)
with check (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

-- Allow users to delete their own files
create policy "Users can delete own note attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (auth.uid())::text
);
