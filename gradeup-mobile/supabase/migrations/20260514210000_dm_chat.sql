-- ============================================================================
-- Direct Messaging (DM) Chat — Pro-only feature
-- ============================================================================

-- 1. Conversations (one row per unique pair of users)
create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint dm_conversations_unique_pair unique (user_a, user_b),
  constraint dm_conversations_no_self check (user_a <> user_b)
);

-- Ensure user_a < user_b so lookup is always deterministic
create or replace function dm_order_users() returns trigger as $$
begin
  if new.user_a > new.user_b then
    declare tmp uuid;
    begin
      tmp := new.user_a;
      new.user_a := new.user_b;
      new.user_b := tmp;
    end;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger dm_conversations_order_users
  before insert on public.dm_conversations
  for each row execute function dm_order_users();

-- 2. Messages
create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  message_type text not null default 'text' check (message_type in ('text', 'flashcard_share', 'quiz_share')),
  metadata jsonb default '{}',
  read_by_recipient boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_dm_messages_conversation on public.dm_messages(conversation_id, created_at desc);
create index if not exists idx_dm_messages_sender on public.dm_messages(sender_id);

-- Auto-update last_message_at on the conversation when a message is inserted
create or replace function dm_update_last_message() returns trigger as $$
begin
  update public.dm_conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$ language plpgsql;

create trigger dm_messages_update_last
  after insert on public.dm_messages
  for each row execute function dm_update_last_message();

-- 3. Shared flashcards via DM
create table if not exists public.dm_shared_flashcards (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  note_id text not null,
  note_title text not null default '',
  cards jsonb not null default '[]',
  created_at timestamptz default now()
);

-- 4. Shared quizzes via DM
create table if not exists public.dm_shared_quizzes (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  quiz_title text not null default '',
  quiz_data jsonb not null default '{}',
  created_at timestamptz default now()
);

-- ============================================================================
-- RLS Policies
-- ============================================================================

alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_shared_flashcards enable row level security;
alter table public.dm_shared_quizzes enable row level security;

-- Conversations: users can only see/create their own
create policy "dm_conversations_select" on public.dm_conversations
  for select using (auth.uid() = user_a or auth.uid() = user_b);

create policy "dm_conversations_insert" on public.dm_conversations
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);

-- Messages: users can see messages in their conversations
create policy "dm_messages_select" on public.dm_messages
  for select using (
    exists (
      select 1 from public.dm_conversations c
      where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "dm_messages_insert" on public.dm_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.dm_conversations c
      where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "dm_messages_update" on public.dm_messages
  for update using (
    exists (
      select 1 from public.dm_conversations c
      where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Shared flashcards: visible if in conversation
create policy "dm_shared_flashcards_select" on public.dm_shared_flashcards
  for select using (
    exists (
      select 1 from public.dm_messages m
      join public.dm_conversations c on c.id = m.conversation_id
      where m.id = message_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "dm_shared_flashcards_insert" on public.dm_shared_flashcards
  for insert with check (sender_id = auth.uid());

-- Shared quizzes: visible if in conversation
create policy "dm_shared_quizzes_select" on public.dm_shared_quizzes
  for select using (
    exists (
      select 1 from public.dm_messages m
      join public.dm_conversations c on c.id = m.conversation_id
      where m.id = message_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "dm_shared_quizzes_insert" on public.dm_shared_quizzes
  for insert with check (sender_id = auth.uid());
