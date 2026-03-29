-- Allow owner or recipient to delete their shared_tasks row only (removes link for that user pair).
-- Does not delete the underlying tasks row.

drop policy if exists "Participants can delete shared task link" on public.shared_tasks;
create policy "Participants can delete shared task link"
  on public.shared_tasks for delete
  using (auth.uid() = owner_id or auth.uid() = recipient_id);
