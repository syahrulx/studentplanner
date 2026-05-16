-- Allow users to delete their own conversations
create policy "dm_conversations_delete" on public.dm_conversations
  for delete using (auth.uid() = user_a or auth.uid() = user_b);
