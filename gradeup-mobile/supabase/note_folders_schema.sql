-- ============================================================
-- NOTE FOLDERS: Per-user only (Row Level Security)
-- Run in Supabase Dashboard → SQL Editor
-- Each user can only see and edit their own note folders.
-- ============================================================

-- 1) Create note_folders table (every row is tied to one user via user_id)
create table if not exists public.note_folders (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

comment on table public.note_folders is 'Note folders (e.g. chapters) per user per subject; RLS ensures user sees only their own rows.';

-- Index for fast lookups by user and subject
create index if not exists idx_note_folders_user_id on public.note_folders(user_id);
create index if not exists idx_note_folders_user_subject on public.note_folders(user_id, subject_id);

-- 2) Row Level Security: restrict access to the current user's rows only
alter table public.note_folders enable row level security;

-- If you re-run this script, drop the policy first to avoid "already exists" error:
drop policy if exists "Users can manage own note_folders" on public.note_folders;

create policy "Users can manage own note_folders"
  on public.note_folders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) Ensure notes table has folder_id so notes can be linked to a folder (per user)
alter table public.notes add column if not exists folder_id text;
create index if not exists idx_notes_folder_id on public.notes(user_id, folder_id);
