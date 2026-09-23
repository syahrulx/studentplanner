-- Recovered on 2026-09-23 from supabase_migrations.schema_migrations.
-- This migration was applied to production through the CLI from a checkout
-- whose file was never committed; the statements below are the recorded ones,
-- verbatim, so the repo and the history table agree. Version kept as-is.

alter table public.flashcards
  add column if not exists review_due date,
  add column if not exists review_interval integer not null default 0,
  add column if not exists review_ease double precision not null default 2.5,
  add column if not exists review_repetitions integer not null default 0,
  add column if not exists last_reviewed_at timestamptz;

create index if not exists flashcards_user_review_due_idx
  on public.flashcards (user_id, review_due);
