-- =============================================================================
-- 20260501000004: Protect State Machine
-- =============================================================================
-- RLS allows row-level UPDATEs but doesn't restrict specific columns easily.
-- These triggers prevent standard users from modifying protected columns,
-- enforcing that all state transitions occur via SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- 1. community_posts trigger
-- ---------------------------------------------------------------------------
create or replace function public.enforce_service_state_machine()
returns trigger
language plpgsql
as $$
begin
  -- Allow service_role, postgres, and admin bypass
  if current_role in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if new.post_type = 'service' then
    if old.service_status is distinct from new.service_status or
       old.claimed_by is distinct from new.claimed_by or
       old.claimed_at is distinct from new.claimed_at or
       old.completed_at is distinct from new.completed_at or
       old.cancelled_at is distinct from new.cancelled_at or
       old.accepted_amount is distinct from new.accepted_amount
    then
      raise exception 'Cannot modify protected service fields directly. Use the provided actions.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_enforce_service_state_machine on public.community_posts;
create trigger tr_enforce_service_state_machine
  before update on public.community_posts
  for each row
  execute function public.enforce_service_state_machine();


-- ---------------------------------------------------------------------------
-- 2. service_offers trigger
-- ---------------------------------------------------------------------------
create or replace function public.enforce_offer_state_machine()
returns trigger
language plpgsql
as $$
begin
  -- Allow service_role, postgres, and admin bypass
  if current_role in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if old.status is distinct from new.status or
     old.service_id is distinct from new.service_id or
     old.offerer_id is distinct from new.offerer_id
  then
    raise exception 'Cannot modify protected offer fields directly. Use the provided actions.';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_enforce_offer_state_machine on public.service_offers;
create trigger tr_enforce_offer_state_machine
  before update on public.service_offers
  for each row
  execute function public.enforce_offer_state_machine();


-- ---------------------------------------------------------------------------
-- 3. service_reviews trigger
-- ---------------------------------------------------------------------------
create or replace function public.enforce_review_state_machine()
returns trigger
language plpgsql
as $$
begin
  -- Allow service_role, postgres, and admin bypass
  if current_role in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if old.service_id is distinct from new.service_id or
     old.reviewer_id is distinct from new.reviewer_id or
     old.reviewee_id is distinct from new.reviewee_id
  then
    raise exception 'Cannot reassign a review to a different user or service.';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_enforce_review_state_machine on public.service_reviews;
create trigger tr_enforce_review_state_machine
  before update on public.service_reviews
  for each row
  execute function public.enforce_review_state_machine();
