-- Run this in Supabase SQL Editor to create tables for study feature (notes, flashcard_folders, flashcards).
-- RLS: allow authenticated users to read/write only their own rows.

-- Notes (per user, per subject)
create table if not exists public.notes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  folder_id text,
  title text not null,
  content text,
  tag text not null default 'Lecture',
  updated_at timestamptz not null default now(),
  attachment_path text,
  attachment_file_name text,
  primary key (id, user_id)
);

alter table public.notes enable row level security;

create policy "Users can manage own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Flashcard folders (per user)
create table if not exists public.flashcard_folders (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at text not null,
  primary key (id, user_id)
);

alter table public.flashcard_folders enable row level security;

create policy "Users can manage own flashcard_folders"
  on public.flashcard_folders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Flashcards (per user, linked to a note)
create table if not exists public.flashcards (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text,
  front text not null,
  back text not null,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

-- If your table still has folder_id instead of note_id, run:
-- ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS note_id text;
-- UPDATE public.flashcards SET note_id = folder_id WHERE note_id IS NULL AND folder_id IS NOT NULL;
-- ALTER TABLE public.flashcards DROP COLUMN IF EXISTS folder_id;

alter table public.flashcards enable row level security;

create policy "Users can manage own flashcards"
  on public.flashcards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- If notes table already existed without these columns, run:
-- alter table public.notes add column if not exists folder_id text;
-- alter table public.notes add column if not exists attachment_path text;
-- alter table public.notes add column if not exists attachment_file_name text;
