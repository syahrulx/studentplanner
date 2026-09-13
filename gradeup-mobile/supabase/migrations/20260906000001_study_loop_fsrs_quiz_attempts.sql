-- ---------------------------------------------------------------------------
-- Study loop: FSRS scheduling for flashcards, per-question quiz attempts,
-- server-side quiz scoring, embedding hygiene, and RLS tightening.
--
-- Safe to re-run (all statements are idempotent).
-- ---------------------------------------------------------------------------

create extension if not exists fuzzystrmatch;

-- ===========================================================================
-- 1. Flashcards: FSRS card state (mirrors ts-fsrs `Card`).
--    state: 0 = New, 1 = Learning, 2 = Review, 3 = Relearning
-- ===========================================================================
alter table public.flashcards
  add column if not exists card_type      text        not null default 'basic',
  add column if not exists hint           text,
  add column if not exists source_excerpt text,
  add column if not exists position       int         not null default 0,
  add column if not exists due            timestamptz not null default now(),
  add column if not exists stability      double precision not null default 0,
  add column if not exists difficulty     double precision not null default 0,
  add column if not exists elapsed_days   int         not null default 0,
  add column if not exists scheduled_days int         not null default 0,
  add column if not exists learning_steps int         not null default 0,
  add column if not exists reps           int         not null default 0,
  add column if not exists lapses         int         not null default 0,
  add column if not exists state          smallint    not null default 0,
  add column if not exists last_review    timestamptz,
  add column if not exists updated_at     timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'flashcards_card_type_check') then
    alter table public.flashcards
      add constraint flashcards_card_type_check check (card_type in ('basic', 'cloze', 'concept'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flashcards_state_check') then
    alter table public.flashcards
      add constraint flashcards_state_check check (state between 0 and 3);
  end if;
end $$;

create index if not exists idx_flashcards_user_due on public.flashcards (user_id, due);
create index if not exists idx_flashcards_user_note on public.flashcards (user_id, note_id);

-- Review log: one row per rating. Needed for FSRS parameter optimisation and
-- for session summaries / stats.
create table if not exists public.flashcard_reviews (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  card_id        text not null,
  note_id        text,
  rating         smallint not null check (rating between 1 and 4), -- 1 Again 2 Hard 3 Good 4 Easy
  state          smallint not null,                                 -- state BEFORE the review
  due            timestamptz not null,                              -- due BEFORE the review
  stability      double precision not null,
  difficulty     double precision not null,
  elapsed_days   int not null,
  scheduled_days int not null,
  review_at      timestamptz not null default now(),
  duration_ms    int
);

create index if not exists idx_flashcard_reviews_user_time on public.flashcard_reviews (user_id, review_at desc);
create index if not exists idx_flashcard_reviews_card on public.flashcard_reviews (user_id, card_id);

alter table public.flashcard_reviews enable row level security;

drop policy if exists "flashcard_reviews_select_own" on public.flashcard_reviews;
create policy "flashcard_reviews_select_own" on public.flashcard_reviews
  for select using (auth.uid() = user_id);
drop policy if exists "flashcard_reviews_insert_own" on public.flashcard_reviews;
create policy "flashcard_reviews_insert_own" on public.flashcard_reviews
  for insert with check (auth.uid() = user_id);
drop policy if exists "flashcard_reviews_delete_own" on public.flashcard_reviews;
create policy "flashcard_reviews_delete_own" on public.flashcard_reviews
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- 2. Quiz attempts: every answered question, with its content, so the app can
--    build a wrong-answer bank, "retry missed", and per-note mastery.
-- ===========================================================================
create table if not exists public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  session_id      uuid references public.quiz_sessions(id) on delete set null,
  question_index  int not null,
  question        text not null,
  options         jsonb not null default '[]'::jsonb,
  correct_index   int not null,
  expected_answer text,
  explanation     text,
  selected_index  int,
  typed_answer    text,
  correct         boolean not null,
  time_ms         int,
  source_type     text,          -- 'notes' | 'flashcards'
  source_id       text,          -- subject id or note id (matches quiz_sessions.source_id)
  source_note_id  text,          -- resolved note id when known
  difficulty      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_quiz_attempts_user_time on public.quiz_attempts (user_id, created_at desc);
create index if not exists idx_quiz_attempts_user_wrong on public.quiz_attempts (user_id, created_at desc) where correct = false;
create index if not exists idx_quiz_attempts_user_source on public.quiz_attempts (user_id, source_note_id);

alter table public.quiz_attempts enable row level security;

drop policy if exists "quiz_attempts_select_own" on public.quiz_attempts;
create policy "quiz_attempts_select_own" on public.quiz_attempts
  for select using (auth.uid() = user_id);
drop policy if exists "quiz_attempts_insert_own" on public.quiz_attempts;
create policy "quiz_attempts_insert_own" on public.quiz_attempts
  for insert with check (auth.uid() = user_id);
drop policy if exists "quiz_attempts_delete_own" on public.quiz_attempts;
create policy "quiz_attempts_delete_own" on public.quiz_attempts
  for delete using (auth.uid() = user_id);

-- Per-note mastery rollup (last 90 days). Read-only view; RLS is inherited
-- from quiz_attempts because the view runs with the caller's privileges.
create or replace view public.quiz_note_mastery
with (security_invoker = true) as
  select
    user_id,
    source_note_id,
    count(*)::int                                   as attempts,
    sum(case when correct then 1 else 0 end)::int   as correct_count,
    round(100.0 * sum(case when correct then 1 else 0 end) / greatest(count(*), 1))::int as accuracy_pct,
    max(created_at)                                 as last_attempt_at
  from public.quiz_attempts
  where source_note_id is not null
    and created_at > now() - interval '90 days'
  group by user_id, source_note_id;

-- ===========================================================================
-- 3. Server-side quiz scoring.
--    The client submits raw answers; the database grades them against the
--    session's stored questions, computes score + speed bonus, writes
--    quiz_participants / quiz_scores, and awards the multiplayer winner bonus
--    exactly once when the final participant finishes.
-- ===========================================================================

-- Normalise free-text answers for comparison.
create or replace function public.quiz_normalize_answer(p text)
returns text
language sql immutable
as $$
  select trim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9\s]', ' ', 'g'))
$$;

-- Lenient-but-safe short-answer grader: exact normalised match, an accepted
-- alias match, or a small Levenshtein distance for typos. Never a bare
-- substring test.
create or replace function public.quiz_short_answer_correct(p_given text, p_expected text, p_accepted jsonb)
returns boolean
language plpgsql immutable
as $$
declare
  given    text := regexp_replace(public.quiz_normalize_answer(p_given), '\s+', ' ', 'g');
  expected text := regexp_replace(public.quiz_normalize_answer(p_expected), '\s+', ' ', 'g');
  alias    text;
  tolerance int;
begin
  if given = '' or expected = '' then return false; end if;
  if given = expected then return true; end if;
  if p_accepted is not null and jsonb_typeof(p_accepted) = 'array' then
    for alias in select jsonb_array_elements_text(p_accepted) loop
      if given = regexp_replace(public.quiz_normalize_answer(alias), '\s+', ' ', 'g') then
        return true;
      end if;
    end loop;
  end if;
  tolerance := greatest(1, floor(length(expected) * 0.2));
  if length(given) >= 3 and levenshtein(given, expected) <= tolerance then
    return true;
  end if;
  return false;
end
$$;

-- Answers payload: [{ "questionIndex": 0, "selectedIndex": 2, "typedAnswer": "...", "timeMs": 4200 }]
create or replace function public.finish_quiz_participant(p_session_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_session       public.quiz_sessions%rowtype;
  v_participant   public.quiz_participants%rowtype;
  v_questions     jsonb;
  v_answer        jsonb;
  v_question      jsonb;
  v_idx           int;
  v_selected      int;
  v_typed         text;
  v_time_ms       int;
  v_correct       boolean;
  v_correct_index int;
  v_score         int := 0;
  v_correct_count int := 0;
  v_total         int;
  v_graded        jsonb := '[]'::jsonb;
  v_is_multi      boolean;
  v_xp            int;
  v_all_finished  boolean;
  v_winner_id     uuid;
  v_top_score     int;
  v_tie           int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_session from public.quiz_sessions where id = p_session_id;
  if not found then
    raise exception 'Quiz session not found' using errcode = 'P0002';
  end if;

  select * into v_participant
  from public.quiz_participants
  where session_id = p_session_id and user_id = v_user_id;
  if not found then
    raise exception 'You are not a participant of this session' using errcode = '42501';
  end if;

  v_questions := coalesce(v_session.questions, '[]'::jsonb);
  v_total := jsonb_array_length(v_questions);
  v_is_multi := v_session.mode = 'multiplayer';

  -- Grade each answer once (first submission per question index wins).
  for v_answer in
    select distinct on ((a->>'questionIndex')::int) a
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
    order by (a->>'questionIndex')::int, a->>'timeMs'
  loop
    v_idx := (v_answer->>'questionIndex')::int;
    if v_idx is null or v_idx < 0 or v_idx >= v_total then continue; end if;
    v_question := v_questions->v_idx;
    v_correct_index := coalesce((v_question->>'correctIndex')::int, -1);
    v_selected := nullif(v_answer->>'selectedIndex', '')::int;
    v_typed := v_answer->>'typedAnswer';
    v_time_ms := greatest(0, coalesce(nullif(v_answer->>'timeMs', '')::int, 0));

    if v_correct_index >= 0 then
      v_correct := v_selected is not null and v_selected = v_correct_index;
    else
      v_correct := public.quiz_short_answer_correct(
        v_typed,
        v_question->>'expectedAnswer',
        v_question->'acceptedAnswers'
      );
    end if;

    if v_correct then
      v_correct_count := v_correct_count + 1;
      v_score := v_score + 10 + case when v_time_ms > 0 and v_time_ms < 5000 then 5 else 0 end;
    end if;

    v_graded := v_graded || jsonb_build_object(
      'questionIndex', v_idx,
      'selectedIndex', coalesce(v_selected, -1),
      'typedAnswer', v_typed,
      'correct', v_correct,
      'timeMs', v_time_ms
    );
  end loop;

  update public.quiz_participants
     set answers = v_graded, score = v_score, finished = true
   where id = v_participant.id;

  v_xp := v_score;

  insert into public.quiz_scores (user_id, session_id, score, correct_count, total_questions, xp_earned)
  values (v_user_id, p_session_id, v_score, v_correct_count, v_total, v_xp)
  on conflict (user_id, session_id) do update
    set score = excluded.score,
        correct_count = excluded.correct_count,
        total_questions = excluded.total_questions,
        xp_earned = excluded.xp_earned;

  -- Multiplayer: when the last participant finishes, award +20 XP to the
  -- unique top scorer and close the session.
  if v_is_multi then
    select bool_and(finished) into v_all_finished
      from public.quiz_participants where session_id = p_session_id;
    if coalesce(v_all_finished, false) then
      select max(score) into v_top_score from public.quiz_participants where session_id = p_session_id;
      select count(*) into v_tie from public.quiz_participants where session_id = p_session_id and score = v_top_score;
      if v_tie = 1 then
        select user_id into v_winner_id from public.quiz_participants
         where session_id = p_session_id and score = v_top_score limit 1;
        update public.quiz_scores
           set xp_earned = score + 20
         where session_id = p_session_id and user_id = v_winner_id and xp_earned = score;
      end if;
      update public.quiz_sessions set status = 'finished' where id = p_session_id and status <> 'finished';
    end if;
  else
    update public.quiz_sessions set status = 'finished' where id = p_session_id and status <> 'finished';
  end if;

  return jsonb_build_object(
    'score', v_score,
    'correct_count', v_correct_count,
    'total_questions', v_total,
    'xp_earned', (select xp_earned from public.quiz_scores where session_id = p_session_id and user_id = v_user_id),
    'is_winner', v_winner_id is not null and v_winner_id = v_user_id,
    'answers', v_graded
  );
end
$$;

revoke all on function public.finish_quiz_participant(uuid, jsonb) from public, anon;
grant execute on function public.finish_quiz_participant(uuid, jsonb) to authenticated;

-- ===========================================================================
-- 4. RLS tightening for quizzes.
-- ===========================================================================

-- Only the host may modify a session row (questions, status, host_id).
drop policy if exists "Host can update session" on public.quiz_sessions;
create policy "Host can update session" on public.quiz_sessions
  for update using (auth.uid() = host_id) with check (auth.uid() = host_id);

-- Participants may no longer write their own score/answers directly; the
-- security-definer function above does it. Keep insert (join) and select.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'quiz_participants' and cmd = 'UPDATE'
  loop
    execute format('drop policy if exists %I on public.quiz_participants', pol.policyname);
  end loop;
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'quiz_scores' and cmd in ('INSERT', 'UPDATE')
  loop
    execute format('drop policy if exists %I on public.quiz_scores', pol.policyname);
  end loop;
end $$;

-- Leaderboard RPCs: authenticated only.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'get_quiz_leaderboard') then
    revoke execute on function public.get_quiz_leaderboard(uuid[], timestamptz, int) from anon;
  end if;
  if exists (select 1 from pg_proc where proname = 'get_quiz_user_rank') then
    revoke execute on function public.get_quiz_user_rank(uuid, timestamptz) from anon;
  end if;
  if exists (select 1 from pg_proc where proname = 'get_word_game_leaderboard') then
    revoke execute on function public.get_word_game_leaderboard(uuid[], int) from anon;
  end if;
  if exists (select 1 from pg_proc where proname = 'get_word_game_user_rank') then
    revoke execute on function public.get_word_game_user_rank(uuid) from anon;
  end if;
exception when undefined_function then
  null;
end $$;

-- ===========================================================================
-- 5. Embedding hygiene.
--    - Tag rows with the embedding model + generation.
--    - Cascade-delete embeddings with their note.
--    - Wipe the old text-embedding-3-small vectors: the index now uses
--      text-embedding-3-large (1536 dims) and the two spaces are not
--      comparable. Notes are re-embedded on next save / extraction / chat open.
-- ===========================================================================
-- The original RAG migration (20260502000000_ai_rag_setup.sql) may never have
-- been applied in some environments, so create the table here if it is missing.
create extension if not exists vector;

create table if not exists public.note_embeddings (
  id          uuid primary key default gen_random_uuid(),
  note_id     text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject_id  text not null,
  chunk_index integer not null,
  content     text not null,
  embedding   vector(1536)
);

create index if not exists note_embeddings_embedding_idx
  on public.note_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.note_embeddings enable row level security;

drop policy if exists "Users can insert their own embeddings" on public.note_embeddings;
create policy "Users can insert their own embeddings" on public.note_embeddings
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can view their own embeddings" on public.note_embeddings;
create policy "Users can view their own embeddings" on public.note_embeddings
  for select using (auth.uid() = user_id);
drop policy if exists "Users can update their own embeddings" on public.note_embeddings;
create policy "Users can update their own embeddings" on public.note_embeddings
  for update using (auth.uid() = user_id);
drop policy if exists "Users can delete their own embeddings" on public.note_embeddings;
create policy "Users can delete their own embeddings" on public.note_embeddings
  for delete using (auth.uid() = user_id);

alter table public.note_embeddings
  add column if not exists embedding_model text,
  add column if not exists generation uuid,
  add column if not exists created_at timestamptz not null default now();

delete from public.note_embeddings where embedding_model is null;

-- Remove orphans (note deleted before the FK existed), then add the FK.
delete from public.note_embeddings ne
where not exists (
  select 1 from public.notes n where n.id = ne.note_id and n.user_id = ne.user_id
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'note_embeddings_note_fk') then
    alter table public.note_embeddings
      add constraint note_embeddings_note_fk
      foreign key (note_id, user_id) references public.notes(id, user_id) on delete cascade;
  end if;
end $$;

create index if not exists idx_note_embeddings_user_subject on public.note_embeddings (user_id, subject_id);
create index if not exists idx_note_embeddings_user_note on public.note_embeddings (user_id, note_id);

-- Lets the client cheaply ask "which of my notes in this subject are indexed?"
create or replace function public.get_embedded_note_ids(p_subject_id text)
returns table (note_id text, chunk_count int, embedding_model text)
language sql stable
security invoker
as $$
  select ne.note_id, count(*)::int, max(ne.embedding_model)
  from public.note_embeddings ne
  where ne.user_id = auth.uid() and ne.subject_id = p_subject_id
  group by ne.note_id;
$$;

grant execute on function public.get_embedded_note_ids(text) to authenticated;

-- Similarity search now also returns note_id ordering for citations (unchanged
-- signature; kept here so the function body is versioned with this migration).
create or replace function public.match_note_embeddings (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid,
  p_subject_id text
)
returns table (id uuid, note_id text, content text, similarity float)
language sql stable
as $$
  select
    ne.id,
    ne.note_id,
    ne.content,
    1 - (ne.embedding <=> query_embedding) as similarity
  from public.note_embeddings ne
  where ne.user_id = p_user_id
    and ne.subject_id = p_subject_id
    and 1 - (ne.embedding <=> query_embedding) > match_threshold
  order by ne.embedding <=> query_embedding
  limit match_count;
$$;
