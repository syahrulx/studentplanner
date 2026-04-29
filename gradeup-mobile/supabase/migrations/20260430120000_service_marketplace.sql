-- =============================================================================
-- 20260430120000: Service Marketplace (Request & Take flow)
-- =============================================================================
-- Extends community_posts with service-specific columns + atomic state-transition
-- RPCs and a service_reviews table for two-way ratings.

-- ---------------------------------------------------------------------------
-- 1. Extend community_posts with service marketplace columns
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='service_kind') then
    alter table public.community_posts add column service_kind text check (service_kind in ('request','offer'));
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='service_category') then
    alter table public.community_posts add column service_category text;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='price_type') then
    alter table public.community_posts add column price_type text check (price_type in ('free','fixed','negotiable')) default 'negotiable';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='price_amount') then
    alter table public.community_posts add column price_amount numeric;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='currency') then
    alter table public.community_posts add column currency text default 'MYR';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='service_status') then
    alter table public.community_posts add column service_status text default 'open' check (service_status in ('open','claimed','completed','cancelled'));
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='claimed_by') then
    alter table public.community_posts add column claimed_by uuid references auth.users(id) on delete set null;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='claimed_at') then
    alter table public.community_posts add column claimed_at timestamptz;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='completed_at') then
    alter table public.community_posts add column completed_at timestamptz;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='deadline_at') then
    alter table public.community_posts add column deadline_at timestamptz;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='cancelled_at') then
    alter table public.community_posts add column cancelled_at timestamptz;
  end if;
end $$;

create index if not exists idx_community_posts_service_status on public.community_posts(service_status) where post_type = 'service';
create index if not exists idx_community_posts_claimed_by    on public.community_posts(claimed_by)     where post_type = 'service';
create index if not exists idx_community_posts_service_kind  on public.community_posts(service_kind)   where post_type = 'service';

-- ---------------------------------------------------------------------------
-- 2. RLS: allow authenticated users to UPDATE the service-state columns of OPEN
--    services they don't own (so they can claim them). Author already has UPDATE.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can claim open services" ON public.community_posts;
CREATE POLICY "Anyone can claim open services"
  on public.community_posts for update
  using (
    auth.uid() is not null
    and post_type = 'service'
    and (
      -- can claim while open
      service_status = 'open'
      -- or release/abandon a claim you made
      or (service_status = 'claimed' and claimed_by = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Atomic state-transition RPCs
-- ---------------------------------------------------------------------------

-- Claim an open service. Sets status=claimed, claimed_by=me, claimed_at=now().
create or replace function public.claim_service(p_service_id uuid)
returns public.community_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.community_posts;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  update public.community_posts
     set service_status = 'claimed',
         claimed_by     = v_uid,
         claimed_at     = now(),
         updated_at     = now()
   where id = p_service_id
     and post_type = 'service'
     and service_status = 'open'
     and author_id <> v_uid
   returning * into v_row;

  if v_row.id is null then
    raise exception 'Service is not available to claim';
  end if;

  return v_row;
end $$;

grant execute on function public.claim_service(uuid) to authenticated;

-- Release a claim you made — back to open.
create or replace function public.unclaim_service(p_service_id uuid)
returns public.community_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.community_posts;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  update public.community_posts
     set service_status = 'open',
         claimed_by     = null,
         claimed_at     = null,
         updated_at     = now()
   where id = p_service_id
     and post_type = 'service'
     and service_status = 'claimed'
     and claimed_by = v_uid
   returning * into v_row;

  if v_row.id is null then
    raise exception 'You do not have an active claim on this service';
  end if;

  return v_row;
end $$;

grant execute on function public.unclaim_service(uuid) to authenticated;

-- Mark a service as completed. Only the author (requester) can mark complete,
-- and only after it's claimed.
create or replace function public.complete_service(p_service_id uuid)
returns public.community_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.community_posts;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  update public.community_posts
     set service_status = 'completed',
         completed_at   = now(),
         updated_at     = now()
   where id = p_service_id
     and post_type = 'service'
     and service_status = 'claimed'
     and author_id = v_uid
   returning * into v_row;

  if v_row.id is null then
    raise exception 'Only the author can complete an active claim';
  end if;

  return v_row;
end $$;

grant execute on function public.complete_service(uuid) to authenticated;

-- Cancel a service (only author, only while open or claimed).
create or replace function public.cancel_service(p_service_id uuid)
returns public.community_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.community_posts;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  update public.community_posts
     set service_status = 'cancelled',
         cancelled_at   = now(),
         updated_at     = now()
   where id = p_service_id
     and post_type = 'service'
     and service_status in ('open','claimed')
     and author_id = v_uid
   returning * into v_row;

  if v_row.id is null then
    raise exception 'Cannot cancel this service';
  end if;

  return v_row;
end $$;

grant execute on function public.cancel_service(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Service reviews (mutual ratings after completion)
-- ---------------------------------------------------------------------------
create table if not exists public.service_reviews (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.community_posts(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewee_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(service_id, reviewer_id)
);

alter table public.service_reviews enable row level security;

DROP POLICY IF EXISTS "Authenticated can read reviews" ON public.service_reviews;
CREATE POLICY "Authenticated can read reviews"
  on public.service_reviews for select using (auth.uid() is not null);

DROP POLICY IF EXISTS "User can create their own review" ON public.service_reviews;
CREATE POLICY "User can create their own review"
  on public.service_reviews for insert with check (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "User can update their own review" ON public.service_reviews;
CREATE POLICY "User can update their own review"
  on public.service_reviews for update using (auth.uid() = reviewer_id);

create index if not exists idx_service_reviews_service on public.service_reviews(service_id);
create index if not exists idx_service_reviews_reviewee on public.service_reviews(reviewee_id);
