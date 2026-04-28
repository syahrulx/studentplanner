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
create policy "Anyone can read active community posts"
  on public.community_posts for select
  using (auth.uid() is not null);

-- Users can create event/service posts; memo requires authority
create policy "Users can create community posts"
  on public.community_posts for insert
  with check (
    auth.uid() = author_id
    and (
      post_type in ('event', 'service')
      or (
        post_type = 'memo'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.authority_status = 'approved'
        )
      )
    )
  );

-- Author can update own posts
create policy "Author can update own posts"
  on public.community_posts for update
  using (auth.uid() = author_id);

-- Author can delete own posts
create policy "Author can delete own posts"
  on public.community_posts for delete
  using (auth.uid() = author_id);

-- Admin full access (uses no-arg is_admin() per migration 018)
create policy "Admin full access community posts"
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
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.authority_requests enable row level security;

-- Users can read own requests
create policy "Users can read own authority requests"
  on public.authority_requests for select
  using (auth.uid() = user_id);

-- Users can create requests
create policy "Users can create authority requests"
  on public.authority_requests for insert
  with check (auth.uid() = user_id);

-- Admin can read all
create policy "Admin can read all authority requests"
  on public.authority_requests for select
  using (public.is_admin());

-- Admin can update (approve/reject)
create policy "Admin can update authority requests"
  on public.authority_requests for update
  using (public.is_admin());

-- Admin can delete
create policy "Admin can delete authority requests"
  on public.authority_requests for delete
  using (public.is_admin());

create index if not exists idx_authority_requests_user on public.authority_requests(user_id);
create index if not exists idx_authority_requests_status on public.authority_requests(status);

-- ---------------------------------------------------------------------------
-- 3. STORAGE BUCKET for post images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('community-images', 'community-images', true)
on conflict (id) do nothing;

-- Anyone authenticated can upload
create policy "Authenticated users can upload community images"
  on storage.objects for insert
  with check (bucket_id = 'community-images' and auth.uid() is not null);

-- Public read
create policy "Public read community images"
  on storage.objects for select
  using (bucket_id = 'community-images');

-- Author can delete own uploads (path starts with their user id)
create policy "Users can delete own community images"
  on storage.objects for delete
  using (bucket_id = 'community-images' and auth.uid()::text = (storage.foldername(name))[1]);
