-- =============================================================================
-- 20260501000000: Fix Service Loopholes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Remove dangerous UPDATE policy on community_posts
-- ---------------------------------------------------------------------------
-- Previously, this allowed anyone to update any column of an open service.
-- State transitions are handled by SECURITY DEFINER RPCs, so this is unneeded.
DROP POLICY IF EXISTS "Anyone can claim open services" ON public.community_posts;

-- ---------------------------------------------------------------------------
-- 2. Fix Reviews RLS
-- ---------------------------------------------------------------------------
-- Previously, anyone could review anyone.
-- Now, we verify the service is completed, and the reviewer is either the author or claimer,
-- and the reviewee is the OTHER party.
DROP POLICY IF EXISTS "User can create their own review" ON public.service_reviews;
CREATE POLICY "User can create their own review"
  on public.service_reviews for insert
  with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.community_posts p
      where p.id = service_id
        and p.service_status = 'completed'
        and (
          (p.author_id = auth.uid() and p.claimed_by = reviewee_id)
          or
          (p.claimed_by = auth.uid() and p.author_id = reviewee_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Update unclaim_service to allow Author to kick a claimer
-- ---------------------------------------------------------------------------
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
     and (claimed_by = v_uid or author_id = v_uid)
   returning * into v_row;

  if v_row.id is null then
    raise exception 'You do not have permission to unclaim this service';
  end if;

  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Update complete_service to enforce Client completion
-- ---------------------------------------------------------------------------
-- For Requests: The Author is the Client.
-- For Offers: The Claimer is the Client.
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
     and (
       (service_kind = 'request' and author_id = v_uid)
       or
       (service_kind = 'offer' and claimed_by = v_uid)
     )
   returning * into v_row;

  if v_row.id is null then
    raise exception 'Only the client receiving the service can mark it as completed';
  end if;

  return v_row;
end $$;
