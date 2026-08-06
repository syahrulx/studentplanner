-- Admin-authored crossword levels. The original 30 crossword puzzles are
-- hardcoded in gradeup-mobile/src/lib/crosswordPuzzles.ts (ids 1-30) and stay
-- exactly that way — this table is purely additive, for NEW levels an admin
-- creates from the admin web app without needing an app release. The id
-- sequence starts at 31 specifically so a puzzle from this table can never
-- collide with a hardcoded puzzle id when the mobile app merges both lists.
--
-- Writes (insert/update/delete) are intentionally NOT exposed to
-- `authenticated` via RLS at all — every write goes through the admin_data
-- Edge Function's service-role client (see supabase/functions/admin_data),
-- same as every other admin-authored content table in this project. Only a
-- single, simple read policy is needed for the mobile app to fetch published
-- levels directly. This deliberately avoids the exact risk class already hit
-- twice on this project (a new table's RLS policies defined in a migration
-- that didn't reliably take effect on the live database) by keeping the only
-- policy this table needs as simple as possible, and by explicitly granting
-- table-level SELECT rather than relying solely on default privilege
-- propagation.

create table if not exists public.crossword_puzzles (
  id integer generated always as identity (start with 31) primary key,
  title text not null check (char_length(trim(title)) between 1 and 100),
  size smallint not null check (size between 5 and 15),
  -- (string|null)[][] — matches CrosswordPuzzle.solution in crosswordEngine.ts
  solution jsonb not null,
  -- CrosswordClue[] — matches CrosswordPuzzle.clues in crosswordEngine.ts
  clues jsonb not null,
  bonus_word text not null check (char_length(trim(bonus_word)) > 0),
  bonus_hint text not null check (char_length(trim(bonus_hint)) > 0),
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crossword_puzzles_published
  on public.crossword_puzzles (is_published, id);

alter table public.crossword_puzzles enable row level security;

-- Explicit table-level grant — defense in depth, don't rely solely on this
-- project's default-privilege propagation for a brand-new table.
grant select on public.crossword_puzzles to authenticated;

drop policy if exists "crossword_puzzles_read_published" on public.crossword_puzzles;
create policy "crossword_puzzles_read_published"
  on public.crossword_puzzles for select to authenticated
  using (is_published = true);

comment on table public.crossword_puzzles is
  'Admin-authored crossword levels (id >= 31), created from the admin web app. Ids 1-30 are hardcoded in the mobile app and never stored here. All writes go through admin_data (service role) — no insert/update/delete RLS policy exists for `authenticated`.';
