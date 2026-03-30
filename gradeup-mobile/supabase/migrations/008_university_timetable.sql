-- University connections: stores which portal a user linked (no passwords)
create table if not exists public.university_connections (
  user_id   uuid references auth.users on delete cascade primary key,
  university_id   text not null,
  student_id      text not null default '',
  connected_at    timestamptz not null default now(),
  last_sync       timestamptz,
  terms_accepted_at timestamptz not null default now()
);

alter table public.university_connections enable row level security;

create policy "Users manage own university_connections"
  on public.university_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Timetable entries scraped / imported from university portal
create table if not exists public.timetable_entries (
  id              text not null,
  user_id         uuid not null references auth.users on delete cascade,
  day             text not null,
  subject_code    text not null default '',
  subject_name    text not null default '',
  lecturer        text not null default '',
  start_time      text not null,
  end_time        text not null,
  location        text not null default '',
  group_name      text,
  semester_label  text,
  primary key (id, user_id)
);

alter table public.timetable_entries enable row level security;

create policy "Users manage own timetable_entries"
  on public.timetable_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
