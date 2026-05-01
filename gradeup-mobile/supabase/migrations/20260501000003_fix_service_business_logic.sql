-- =============================================================================
-- 20260501000003: Fix Service Business Logic
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add non-negative constraints
-- ---------------------------------------------------------------------------
do $$
begin
  -- Prevent negative prices on services
  alter table public.community_posts
    add constraint chk_price_amount check (price_amount is null or price_amount >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  -- Prevent negative amounts on offers
  alter table public.service_offers
    add constraint chk_offer_amount check (amount is null or amount >= 0);
exception
  when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------------
-- 2. Update cancel_service to reject all pending offers
-- ---------------------------------------------------------------------------
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

  -- Auto-reject all pending offers
  update public.service_offers
     set status = 'rejected', updated_at = now()
   where service_id = p_service_id
     and status = 'pending';

  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Update unclaim_service to clear accepted_amount and withdraw accepted offer
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
         accepted_amount = null,
         updated_at     = now()
   where id = p_service_id
     and post_type = 'service'
     and service_status = 'claimed'
     and (claimed_by = v_uid or author_id = v_uid)
   returning * into v_row;

  if v_row.id is null then
    raise exception 'You do not have permission to unclaim this service';
  end if;

  -- The previously accepted offer is no longer valid. Mark it withdrawn/rejected
  update public.service_offers
     set status = 'withdrawn', updated_at = now()
   where service_id = p_service_id
     and status = 'accepted';

  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Update make_service_offer to block offers on 'free' services
-- ---------------------------------------------------------------------------
create or replace function public.make_service_offer(
  p_service_id uuid,
  p_amount numeric,
  p_message text default null
)
returns public.service_offers
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_offers;
  v_svc public.community_posts;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_svc from public.community_posts
   where id = p_service_id and post_type = 'service';
  if v_svc.id is null then raise exception 'Service not found'; end if;
  if v_svc.author_id = v_uid then raise exception 'Cannot offer on your own service'; end if;
  if v_svc.service_status <> 'open' then raise exception 'Service is no longer accepting offers'; end if;
  if v_svc.price_type = 'free' then raise exception 'Free services do not accept monetary offers. Claim it directly.'; end if;

  -- Update existing pending offer if present, else insert a new one.
  update public.service_offers
     set amount = p_amount,
         message = p_message,
         updated_at = now()
   where service_id = p_service_id
     and offerer_id = v_uid
     and status = 'pending'
   returning * into v_row;

  if v_row.id is null then
    insert into public.service_offers (service_id, offerer_id, amount, currency, message)
    values (p_service_id, v_uid, p_amount, coalesce(v_svc.currency, 'MYR'), p_message)
    returning * into v_row;
  end if;

  return v_row;
end $$;
