-- =============================================================================
-- ALL-IN-ONE COMMUNITY & PROFILES SETUP
-- This script is IDEMPOTENT: you can run it multiple times.
-- It handles profiles, migrations, and all community features.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. BASE PROFILES TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  name text,
  university text,
  updated_at timestamptz not null default now(),
  primary key (id)
);

alter table public.profiles enable row level security;

-- Drop existing policies to avoid "already exists" errors
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Authenticated users can read profiles" on public.profiles;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Authenticated users can read profiles" on public.profiles for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- 2. PROFILE MIGRATIONS (Add missing columns)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists faculty text;
alter table public.profiles add column if not exists course text;
alter table public.profiles add column if not exists class_group text;
alter table public.profiles add column if not exists location_visibility text not null default 'friends'
  check (location_visibility in ('public', 'friends', 'off'));

-- ---------------------------------------------------------------------------
-- 3. COMMUNITY TABLES (Friendships, Circles, etc.)
-- ---------------------------------------------------------------------------

-- --- Friendships ---
create table if not exists public.friendships (
  id uuid not null default gen_random_uuid() primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;
drop policy if exists "Users can read own friendships" on public.friendships;
drop policy if exists "Users can send friend requests" on public.friendships;
drop policy if exists "Users can update own friendships" on public.friendships;
drop policy if exists "Users can delete own friendships" on public.friendships;

create policy "Users can read own friendships" on public.friendships for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Users can send friend requests" on public.friendships for insert with check (auth.uid() = requester_id);
create policy "Users can update own friendships" on public.friendships for update using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Users can delete own friendships" on public.friendships for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- --- Circles ---
create table if not exists public.circles (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  emoji text not null default '👥',
  invite_code text not null default encode(gen_random_bytes(6), 'hex'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.circles enable row level security;
drop policy if exists "Anyone can read circles" on public.circles;
drop policy if exists "Users can create circles" on public.circles;
drop policy if exists "Creator can update circles" on public.circles;
drop policy if exists "Creator can delete circles" on public.circles;
drop policy if exists "Members can read own circles" on public.circles;

create policy "Anyone can read circles" on public.circles for select using (auth.uid() is not null);
create policy "Users can create circles" on public.circles for insert with check (auth.uid() = created_by);
create policy "Creator can update circles" on public.circles for update using (auth.uid() = created_by);
create policy "Creator can delete circles" on public.circles for delete using (auth.uid() = created_by);

-- --- Circle Members ---
create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

alter table public.circle_members enable row level security;
drop policy if exists "Members can read circle members" on public.circle_members;
drop policy if exists "Users can join circles" on public.circle_members;
drop policy if exists "Members can update" on public.circle_members;
drop policy if exists "Members can leave circles" on public.circle_members;

create policy "Members can read circle members"
on public.circle_members for select
using (auth.uid() = user_id);
create policy "Users can join circles" on public.circle_members for insert with check (auth.uid() = user_id);
create policy "Members can update" on public.circle_members for update using (auth.uid() = user_id or role = 'admin');
create policy "Members can leave circles" on public.circle_members for delete using (auth.uid() = user_id);

-- Add the deferred circles policy now that members table exists
create policy "Members can read own circles" on public.circles for select using (
  exists (select 1 from public.circle_members cm where cm.circle_id = circles.id and cm.user_id = auth.uid())
  or created_by = auth.uid()
);

-- --- User Locations ---
create table if not exists public.user_locations (
  user_id uuid not null references auth.users(id) on delete cascade primary key,
  latitude double precision not null,
  longitude double precision not null,
  place_name text,
  updated_at timestamptz not null default now(),
  visibility text not null default 'friends' check (visibility in ('public', 'friends', 'circles', 'off'))
);

alter table public.user_locations enable row level security;
drop policy if exists "Users can read own location" on public.user_locations;
drop policy if exists "Friends can read locations" on public.user_locations;
drop policy if exists "Users can upsert own location" on public.user_locations;
drop policy if exists "Users can update own location" on public.user_locations;

create policy "Users can read own location" on public.user_locations for select using (auth.uid() = user_id);
create policy "Friends can read locations" on public.user_locations for select using (
  visibility = 'public'
  or (
    visibility = 'friends'
    and exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = user_locations.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = user_locations.user_id)
        )
    )
  )
  or (
    visibility = 'circles'
    and exists (
      select 1
      from public.circle_members cm_me
      join public.circle_members cm_them
        on cm_me.circle_id = cm_them.circle_id
      where cm_me.user_id = auth.uid()
        and cm_them.user_id = user_locations.user_id
    )
  )
);
create policy "Users can upsert own location" on public.user_locations for insert with check (auth.uid() = user_id);
create policy "Users can update own location" on public.user_locations for update using (auth.uid() = user_id);

-- --- User Activities ---
create table if not exists public.user_activities (
  user_id uuid not null references auth.users(id) on delete cascade primary key,
  activity_type text not null default 'idle',
  detail text,
  course_name text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_activities enable row level security;
drop policy if exists "Users can read own activity" on public.user_activities;
drop policy if exists "Friends can read activities" on public.user_activities;
drop policy if exists "Users can upsert own activity" on public.user_activities;
drop policy if exists "Users can update own activity" on public.user_activities;

create policy "Users can read own activity" on public.user_activities for select using (auth.uid() = user_id);
create policy "Friends can read activities" on public.user_activities for select using (
  exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.requester_id = auth.uid() and f.addressee_id = user_activities.user_id) or (f.addressee_id = auth.uid() and f.requester_id = user_activities.user_id)))
);
create policy "Users can upsert own activity" on public.user_activities for insert with check (auth.uid() = user_id);
create policy "Users can update own activity" on public.user_activities for update using (auth.uid() = user_id);

-- --- Quick Reactions ---
create table if not exists public.quick_reactions (
  id uuid not null default gen_random_uuid() primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null,
  message text,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

alter table public.quick_reactions enable row level security;
drop policy if exists "Users can read own reactions" on public.quick_reactions;
drop policy if exists "Users can send reactions" on public.quick_reactions;
drop policy if exists "Receiver can update reactions" on public.quick_reactions;
drop policy if exists "Users can delete own reactions" on public.quick_reactions;

create policy "Users can read own reactions" on public.quick_reactions for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Users can send reactions" on public.quick_reactions for insert with check (auth.uid() = sender_id);
create policy "Receiver can update reactions" on public.quick_reactions for update using (auth.uid() = receiver_id);
create policy "Users can delete own reactions" on public.quick_reactions for delete using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- ---------------------------------------------------------------------------
-- 4. TRIGGER FOR AUTO-PROFILES
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, university, updated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'university', null),
    now()
  )
  on conflict (id) do update set
    name = coalesce(excluded.name, profiles.name),
    university = coalesce(excluded.university, profiles.university),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. INDEXES
-- ---------------------------------------------------------------------------
create index if not exists idx_friendships_requester on public.friendships(requester_id);
create index if not exists idx_friendships_addressee on public.friendships(addressee_id);
create index if not exists idx_friendships_status on public.friendships(status);
create index if not exists idx_circle_members_user on public.circle_members(user_id);
create index if not exists idx_circle_members_circle on public.circle_members(circle_id);
create index if not exists idx_quick_reactions_receiver on public.quick_reactions(receiver_id, read);
create index if not exists idx_quick_reactions_sender on public.quick_reactions(sender_id);
