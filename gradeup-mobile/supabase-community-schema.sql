-- =============================================================================
-- Community Feature Schema for Rencana Mobile
-- Run this in Supabase SQL Editor AFTER profiles schema is set up.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FRIENDSHIPS
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid not null default gen_random_uuid() primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

-- Drop existing policies to avoid "already exists" errors
drop policy if exists "Users can read own friendships" on public.friendships;
drop policy if exists "Users can send friend requests" on public.friendships;
drop policy if exists "Users can update own friendships" on public.friendships;
drop policy if exists "Users can delete own friendships" on public.friendships;

-- Users can see friendships they are part of
create policy "Users can read own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Users can create friend requests
create policy "Users can send friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

-- Users can update friendships they are part of (accept/block)
create policy "Users can update own friendships"
  on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Users can delete friendships they are part of
create policy "Users can delete own friendships"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ---------------------------------------------------------------------------
-- 2. CIRCLES (Groups)
-- ---------------------------------------------------------------------------
create table if not exists public.circles (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  emoji text not null default '👥',
  invite_code text not null default encode(gen_random_bytes(6), 'hex'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.circles enable row level security;

-- Drop existing policies
drop policy if exists "Anyone can read circles" on public.circles;
drop policy if exists "Users can create circles" on public.circles;
drop policy if exists "Creator can update circles" on public.circles;
drop policy if exists "Creator can delete circles" on public.circles;
drop policy if exists "Members can read own circles" on public.circles;

-- Any authenticated user can read circles (for joining by invite code)
create policy "Anyone can read circles"
  on public.circles for select
  using (auth.uid() is not null);

-- Creator can insert circles
create policy "Users can create circles"
  on public.circles for insert
  with check (auth.uid() = created_by);

-- Creator can update circles
create policy "Creator can update circles"
  on public.circles for update
  using (auth.uid() = created_by);

-- Creator can delete circles
create policy "Creator can delete circles"
  on public.circles for delete
  using (auth.uid() = created_by);

-- ---------------------------------------------------------------------------
-- 3. CIRCLE MEMBERS
-- ---------------------------------------------------------------------------
create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

alter table public.circle_members enable row level security;

-- Drop existing policies
drop policy if exists "Members can read circle members" on public.circle_members;
drop policy if exists "Users can join circles" on public.circle_members;
drop policy if exists "Members can update" on public.circle_members;
drop policy if exists "Members can leave circles" on public.circle_members;

create or replace function public.is_circle_member(p_circle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = p_circle_id
      and cm.user_id = p_user_id
  );
$$;

revoke all on function public.is_circle_member(uuid, uuid) from public;
grant execute on function public.is_circle_member(uuid, uuid) to authenticated;

create policy "Members can read circle members"
  on public.circle_members for select
  using (public.is_circle_member(circle_members.circle_id, auth.uid()));

-- Users can join circles (insert themselves)
create policy "Users can join circles"
  on public.circle_members for insert
  with check (
    auth.uid() = user_id
    or exists (
      select 1
      from public.circle_members cm_admin
      where cm_admin.circle_id = circle_members.circle_id
        and cm_admin.user_id = auth.uid()
        and cm_admin.role = 'admin'
    )
  );

-- Admins can update roles, or users can update their own
create policy "Members can update"
  on public.circle_members for update
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.circle_members cm_admin
      where cm_admin.circle_id = circle_members.circle_id
        and cm_admin.user_id = auth.uid()
        and cm_admin.role = 'admin'
    )
    or exists (
      select 1
      from public.circles c
      where c.id = circle_members.circle_id
        and c.created_by = auth.uid()
    )
  );

-- Users can leave circles (delete themselves), admins can remove members
create policy "Members can leave circles"
  on public.circle_members for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.circle_members cm_admin
      where cm_admin.circle_id = circle_members.circle_id
        and cm_admin.user_id = auth.uid()
        and cm_admin.role = 'admin'
    )
    or exists (
      select 1
      from public.circles c
      where c.id = circle_members.circle_id
        and c.created_by = auth.uid()
    )
  );

-- (Deferred from circles section — needs circle_members to exist first)
create policy "Members can read own circles"
  on public.circles for select
  using (
    exists (
      select 1 from public.circle_members cm
      where cm.circle_id = circles.id and cm.user_id = auth.uid()
    )
    or created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3B. CIRCLE INVITATIONS
-- ---------------------------------------------------------------------------
create table if not exists public.circle_invitations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (circle_id, invitee_id)
);

alter table public.circle_invitations enable row level security;

drop policy if exists "Invitee can read circle invitations" on public.circle_invitations;
create policy "Invitee can read circle invitations"
  on public.circle_invitations for select
  using (auth.uid() = invitee_id);

drop policy if exists "Invitee can respond to circle invitations" on public.circle_invitations;
create policy "Invitee can respond to circle invitations"
  on public.circle_invitations for update
  using (auth.uid() = invitee_id)
  with check (auth.uid() = invitee_id and status in ('pending', 'accepted', 'rejected'));

drop policy if exists "Circle admins can invite" on public.circle_invitations;
create policy "Circle admins can invite"
  on public.circle_invitations for insert
  with check (
    auth.uid() = inviter_id
    and exists (
      select 1 from public.circle_members cm
      where cm.circle_id = circle_invitations.circle_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  );

drop policy if exists "Circle admins can update invites" on public.circle_invitations;
create policy "Circle admins can update invites"
  on public.circle_invitations for update
  using (
    auth.uid() = inviter_id
    and exists (
      select 1 from public.circle_members cm
      where cm.circle_id = circle_invitations.circle_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  )
  with check (
    auth.uid() = inviter_id
    and exists (
      select 1 from public.circle_members cm
      where cm.circle_id = circle_invitations.circle_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. USER LOCATIONS (upserted, real-time)
-- ---------------------------------------------------------------------------
create table if not exists public.user_locations (
  user_id uuid not null references auth.users(id) on delete cascade primary key,
  latitude double precision not null,
  longitude double precision not null,
  place_name text,
  updated_at timestamptz not null default now(),
  visibility text not null default 'friends' check (visibility in ('public', 'friends', 'circles', 'off'))
);

alter table public.user_locations enable row level security;

-- Drop existing policies
drop policy if exists "Users can read own location" on public.user_locations;
drop policy if exists "Friends can read locations" on public.user_locations;
drop policy if exists "Users can upsert own location" on public.user_locations;
drop policy if exists "Users can update own location" on public.user_locations;

-- Users can read their own location
create policy "Users can read own location"
  on public.user_locations for select
  using (auth.uid() = user_id);

-- Users can read friends' or circle members' locations (if visibility allows)
create policy "Friends can read locations"
  on public.user_locations for select
  using (
    visibility = 'public'
    or (
      visibility = 'friends'
      and exists (
        select 1 from public.friendships f
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

-- Users can insert/update their own location
create policy "Users can upsert own location"
  on public.user_locations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own location"
  on public.user_locations for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. USER ACTIVITIES (current status)
-- ---------------------------------------------------------------------------
create table if not exists public.user_activities (
  user_id uuid not null references auth.users(id) on delete cascade primary key,
  activity_type text not null default 'idle',
  detail text,
  course_name text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_activities enable row level security;

-- Drop existing policies
drop policy if exists "Users can read own activity" on public.user_activities;
drop policy if exists "Friends can read activities" on public.user_activities;
drop policy if exists "Users can upsert own activity" on public.user_activities;
drop policy if exists "Users can update own activity" on public.user_activities;

-- Users can read own activity
create policy "Users can read own activity"
  on public.user_activities for select
  using (auth.uid() = user_id);

-- Friends can read activities
create policy "Friends can read activities"
  on public.user_activities for select
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = user_activities.user_id)
        or (f.addressee_id = auth.uid() and f.requester_id = user_activities.user_id)
      )
    )
  );

-- Users can insert/update own activity
create policy "Users can upsert own activity"
  on public.user_activities for insert
  with check (auth.uid() = user_id);

create policy "Users can update own activity"
  on public.user_activities for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. QUICK REACTIONS
-- ---------------------------------------------------------------------------
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

-- Drop existing policies
drop policy if exists "Users can read own reactions" on public.quick_reactions;
drop policy if exists "Users can send reactions" on public.quick_reactions;
drop policy if exists "Receiver can update reactions" on public.quick_reactions;
drop policy if exists "Users can delete own reactions" on public.quick_reactions;

-- Users can read reactions sent to or from them
create policy "Users can read own reactions"
  on public.quick_reactions for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Users can send reactions
create policy "Users can send reactions"
  on public.quick_reactions for insert
  with check (auth.uid() = sender_id);

-- Receiver can mark as read
create policy "Receiver can update reactions"
  on public.quick_reactions for update
  using (auth.uid() = receiver_id);

-- Users can delete their own sent/received reactions
create policy "Users can delete own reactions"
  on public.quick_reactions for delete
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- ---------------------------------------------------------------------------
-- INDEXES for performance
-- ---------------------------------------------------------------------------
create index if not exists idx_friendships_requester on public.friendships(requester_id);
create index if not exists idx_friendships_addressee on public.friendships(addressee_id);
create index if not exists idx_friendships_status on public.friendships(status);
create index if not exists idx_circle_members_user on public.circle_members(user_id);
create index if not exists idx_circle_members_circle on public.circle_members(circle_id);
create index if not exists idx_quick_reactions_receiver on public.quick_reactions(receiver_id, read);
create index if not exists idx_quick_reactions_sender on public.quick_reactions(sender_id);
