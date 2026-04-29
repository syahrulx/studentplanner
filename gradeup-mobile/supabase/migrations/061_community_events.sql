-- =============================================================================
-- 061: Community Events, Memos & Authority System
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. PROFILE: authority_status column  ← must exist BEFORE RLS policies below
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'authority_status'
  ) then
    alter table public.profiles add column authority_status text default null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. COMMUNITY POSTS (events, services, memos)
-- ---------------------------------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null check (post_type in ('event', 'service', 'memo')),
  title text not null,
  body text,
  image_url text,
  university_id text,
  campus text,
  event_date date,
  event_time text,
  location text,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'closed', 'flagged')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.community_posts enable row level security;

-- All authenticated users can read active posts
DROP POLICY IF EXISTS "Anyone can read active community posts" ON public.community_posts;
CREATE POLICY "Anyone can read active community posts"
  on public.community_posts for select
  using (auth.uid() is not null);

-- Only service is open to all; event and memo require authority
DROP POLICY IF EXISTS "Users can create community posts" ON public.community_posts;
CREATE POLICY "Users can create community posts"
  on public.community_posts for insert
  with check (
    auth.uid() = author_id
    and (
      post_type = 'service'
      or (
        post_type in ('event', 'memo')
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.authority_status = 'approved'
        )
      )
    )
  );

-- Author can update own posts
DROP POLICY IF EXISTS "Author can update own posts" ON public.community_posts;
CREATE POLICY "Author can update own posts"
  on public.community_posts for update
  using (auth.uid() = author_id);

-- Author can delete own posts
DROP POLICY IF EXISTS "Author can delete own posts" ON public.community_posts;
CREATE POLICY "Author can delete own posts"
  on public.community_posts for delete
  using (auth.uid() = author_id);

-- Admin full access (uses no-arg is_admin() per migration 018)
DROP POLICY IF EXISTS "Admin full access community posts" ON public.community_posts;
CREATE POLICY "Admin full access community posts"
  on public.community_posts for all
  using (public.is_admin());

-- Indexes
create index if not exists idx_community_posts_author on public.community_posts(author_id);
create index if not exists idx_community_posts_type on public.community_posts(post_type);
create index if not exists idx_community_posts_university on public.community_posts(university_id);
create index if not exists idx_community_posts_status on public.community_posts(status);
create index if not exists idx_community_posts_created on public.community_posts(created_at desc);

-- ---------------------------------------------------------------------------
-- 2. AUTHORITY REQUESTS
-- ---------------------------------------------------------------------------
create table if not exists public.authority_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id text,
  role_title text not null,
  justification text,
  proof_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Add proof_url column if table already exists without it
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'authority_requests' and column_name = 'proof_url'
  ) then
    alter table public.authority_requests add column proof_url text;
  end if;
end $$;

alter table public.authority_requests enable row level security;

-- Users can read own requests
DROP POLICY IF EXISTS "Users can read own authority requests" ON public.authority_requests;
CREATE POLICY "Users can read own authority requests"
  on public.authority_requests for select
  using (auth.uid() = user_id);

-- Users can create requests
DROP POLICY IF EXISTS "Users can create authority requests" ON public.authority_requests;
CREATE POLICY "Users can create authority requests"
  on public.authority_requests for insert
  with check (auth.uid() = user_id);

-- Admin can read all
DROP POLICY IF EXISTS "Admin can read all authority requests" ON public.authority_requests;
CREATE POLICY "Admin can read all authority requests"
  on public.authority_requests for select
  using (public.is_admin());

-- Admin can update (approve/reject)
DROP POLICY IF EXISTS "Admin can update authority requests" ON public.authority_requests;
CREATE POLICY "Admin can update authority requests"
  on public.authority_requests for update
  using (public.is_admin());

-- Admin can delete
DROP POLICY IF EXISTS "Admin can delete authority requests" ON public.authority_requests;
CREATE POLICY "Admin can delete authority requests"
  on public.authority_requests for delete
  using (public.is_admin());

create index if not exists idx_authority_requests_user on public.authority_requests(user_id);
create index if not exists idx_authority_requests_status on public.authority_requests(status);

-- ---------------------------------------------------------------------------
-- 3. STORAGE BUCKET for post images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('community-images', 'community-images', true)
on conflict (id) do update set public = true;

-- Anyone authenticated can upload
DROP POLICY IF EXISTS "Authenticated users can upload community images" ON storage.objects;
CREATE POLICY "Authenticated users can upload community images"
  on storage.objects for insert
  with check (bucket_id = 'community-images' and auth.uid() is not null);

-- Public read
DROP POLICY IF EXISTS "Public read community images" ON storage.objects;
CREATE POLICY "Public read community images"
  on storage.objects for select
  using (bucket_id = 'community-images');

-- Author can delete own uploads (path starts with their user id)
DROP POLICY IF EXISTS "Users can delete own community images" ON storage.objects;
CREATE POLICY "Users can delete own community images"
  on storage.objects for delete
  using (bucket_id = 'community-images' and auth.uid()::text = (storage.foldername(name))[1]);
