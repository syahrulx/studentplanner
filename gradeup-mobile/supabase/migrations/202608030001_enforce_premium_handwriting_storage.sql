-- Free users can always read their existing private notes, including prior
-- handwriting. Only Plus and Pro users may create, replace or remove the
-- editable handwriting layer. This leaves all other note attachments intact.

drop policy if exists "Users can upload own note attachments" on storage.objects;
create policy "Users can upload own note attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'note-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      storage.filename(name) <> '_handwriting-v1.json'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.subscription_plan in ('plus', 'pro')
      )
    )
  );

drop policy if exists "Users can update own note attachments" on storage.objects;
create policy "Users can update own note attachments"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'note-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'note-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      storage.filename(name) <> '_handwriting-v1.json'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.subscription_plan in ('plus', 'pro')
      )
    )
  );

drop policy if exists "Users can delete own note attachments" on storage.objects;
create policy "Users can delete own note attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'note-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      storage.filename(name) <> '_handwriting-v1.json'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.subscription_plan in ('plus', 'pro')
      )
    )
  );
