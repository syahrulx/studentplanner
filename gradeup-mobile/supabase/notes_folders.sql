-- ============================================================
-- NOTES: Folders (chapters) per user + link notes to folders
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Create note_folders (per user, per subject)
create table if not exists public.note_folders (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

create index if not exists idx_note_folders_user_subject on public.note_folders(user_id, subject_id);

alter table public.note_folders enable row level security;

create policy "Users can manage own note_folders"
  on public.note_folders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2) Add folder_id to notes (optional). Safe to re-run.
alter table public.notes add column if not exists folder_id text;
create index if not exists idx_notes_user_subject_folder on public.notes(user_id, subject_id, folder_id);

-- (Optional) If you want folder_id to be enforced, you can add a FK constraint.
-- Because notes uses (id,user_id) composite PK, we keep this optional.
-- alter table public.notes
--   add constraint notes_folder_fk
--   foreign key (folder_id, user_id)
--   references public.note_folders(id, user_id)
--   on delete set null;

