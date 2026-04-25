-- Fixes silent failures of note writes and ensures notes/flashcards schema
-- matches what the mobile client writes today.
--
-- Problem:
--   `src/lib/studyDb.ts::upsertNote` writes an `extraction_error` column, but
--   no migration ever added it. Postgres rejects every insert/upsert with
--   "column extraction_error of relation notes does not exist", and because
--   AppContext fires the promise without catching errors, notes vanish in
--   production even though the UI shows them locally.
--
-- Also:
--   The base tables are defined in supabase/supabase-study-schema.sql (outside
--   the migrations folder), so a fresh environment that only runs
--   `supabase db push` wouldn't have them. This migration creates them
--   idempotently.

-- ---------------------------------------------------------------------------
-- Base tables (idempotent: matches supabase/supabase-study-schema.sql).
-- ---------------------------------------------------------------------------

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

create table if not exists public.flashcards (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text,
  front text not null,
  back text not null,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Backfill any columns the client writes that may be missing on older deploys.
-- ---------------------------------------------------------------------------

alter table public.notes
  add column if not exists folder_id text,
  add column if not exists attachment_path text,
  add column if not exists attachment_file_name text,
  add column if not exists extracted_text text,
  add column if not exists extraction_error text;

-- Same "has cached extracted text?" index the 046 migration ships. Harmless if
-- 046 already ran.
create index if not exists idx_notes_extracted_text_not_null
  on public.notes (user_id, id)
  where extracted_text is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security (each user can only touch their own rows).
-- ---------------------------------------------------------------------------

alter table public.notes      enable row level security;
alter table public.flashcards enable row level security;

drop policy if exists "Users can manage own notes"      on public.notes;
drop policy if exists "Users can manage own flashcards" on public.flashcards;

create policy "Users can manage own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own flashcards"
  on public.flashcards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
