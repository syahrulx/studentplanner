-- Quiz Sessions: one row per game (solo or multiplayer)
create table if not exists quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'solo' check (mode in ('solo', 'multiplayer')),
  match_type text not null default 'friend' check (match_type in ('friend', 'circle', 'random')),
  source_type text not null default 'flashcards' check (source_type in ('flashcards', 'notes')),
  source_id text,
  quiz_type text not null default 'mcq' check (quiz_type in ('mcq', 'true_false', 'mixed', 'short_answer')),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  question_count int not null default 5,
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'waiting' check (status in ('waiting', 'in_progress', 'finished')),
  invite_code text unique,
  circle_id uuid references circles(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_quiz_sessions_host on quiz_sessions(host_id);
create index if not exists idx_quiz_sessions_status on quiz_sessions(status);
create index if not exists idx_quiz_sessions_invite on quiz_sessions(invite_code);

-- Quiz Participants: one row per player per session
create table if not exists quiz_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references quiz_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score int not null default 0,
  answers jsonb not null default '[]'::jsonb,
  finished boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(session_id, user_id)
);

create index if not exists idx_quiz_participants_session on quiz_participants(session_id);
create index if not exists idx_quiz_participants_user on quiz_participants(user_id);

-- Quiz Scores: aggregated history for leaderboard
create table if not exists quiz_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references quiz_sessions(id) on delete cascade,
  score int not null default 0,
  correct_count int not null default 0,
  total_questions int not null default 0,
  xp_earned int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_quiz_scores_user on quiz_scores(user_id);
create index if not exists idx_quiz_scores_xp on quiz_scores(xp_earned desc);
create index if not exists idx_quiz_scores_created on quiz_scores(created_at desc);

-- RLS policies
alter table quiz_sessions enable row level security;
alter table quiz_participants enable row level security;
alter table quiz_scores enable row level security;

drop policy if exists "Users can view sessions they participate in" on quiz_sessions;
drop policy if exists "Users can create sessions" on quiz_sessions;
drop policy if exists "Host can update session" on quiz_sessions;
drop policy if exists "Users can view participants in their sessions" on quiz_participants;
drop policy if exists "Users can join sessions" on quiz_participants;
drop policy if exists "Users can update their own participation" on quiz_participants;
drop policy if exists "Users can view all scores (for leaderboard)" on quiz_scores;
drop policy if exists "Users can insert their own scores" on quiz_scores;

create policy "Users can view sessions they participate in"
  on quiz_sessions for select
  using (
    auth.uid() = host_id
    -- Allow reading waiting sessions so others can join by invite/random.
    or status = 'waiting'
  );

create policy "Users can create sessions"
  on quiz_sessions for insert
  with check (auth.uid() = host_id);

create policy "Host can update session"
  on quiz_sessions for update
  using (auth.uid() = host_id or exists (select 1 from quiz_participants where quiz_participants.session_id = quiz_sessions.id and quiz_participants.user_id = auth.uid()));

create policy "Users can view participants in their sessions"
  on quiz_participants for select
  using (
    -- This direction (participants -> sessions) is safe because
    -- sessions policy no longer queries participants (avoids recursion).
    exists (
      select 1
      from quiz_sessions
      where quiz_sessions.id = quiz_participants.session_id
        and (quiz_sessions.host_id = auth.uid() or quiz_sessions.status = 'waiting')
    )
    or user_id = auth.uid()
  );

create policy "Users can join sessions"
  on quiz_participants for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own participation"
  on quiz_participants for update
  using (auth.uid() = user_id);

create policy "Users can view all scores (for leaderboard)"
  on quiz_scores for select
  using (true);

create policy "Users can insert their own scores"
  on quiz_scores for insert
  with check (auth.uid() = user_id);

-- Enable realtime
alter publication supabase_realtime add table quiz_sessions;
alter publication supabase_realtime add table quiz_participants;
