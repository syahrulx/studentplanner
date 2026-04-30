-- =============================================================================
-- 20260430130000: Service Offers (negotiation) + WhatsApp handoff
-- =============================================================================
-- Adds a negotiation layer on top of the service marketplace:
--   • Takers can submit `service_offers` with their proposed amount + message.
--   • Requester (author) accepts one offer → service is claimed by that
--     offerer at the agreed amount; all other pending offers auto-reject.
--   • profiles.whatsapp_number lets the two parties WhatsApp each other once
--     the service is claimed.

-- ---------------------------------------------------------------------------
-- 1. profiles.whatsapp_number
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='whatsapp_number'
  ) then
    alter table public.profiles add column whatsapp_number text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. accepted_amount on community_posts (snapshot of the agreed price after
--    an offer is accepted; survives even if the offer is later withdrawn).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='community_posts' and column_name='accepted_amount'
  ) then
    alter table public.community_posts add column accepted_amount numeric;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. service_offers table
-- ---------------------------------------------------------------------------
create table if not exists public.service_offers (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.community_posts(id) on delete cascade,
  offerer_id uuid not null references auth.users(id) on delete cascade,
  amount numeric,                      -- null = "match the asking price"
  currency text default 'MYR',
  message text,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only one *active* offer per offerer per service. Rejected/withdrawn offers
  -- can coexist as history.
  unique (service_id, offerer_id, status) deferrable initially deferred
);

create index if not exists idx_service_offers_service on public.service_offers(service_id);
create index if not exists idx_service_offers_offerer on public.service_offers(offerer_id);
create index if not exists idx_service_offers_status  on public.service_offers(status);

alter table public.service_offers enable row level security;

drop policy if exists "Authenticated can read offers" on public.service_offers;
create policy "Authenticated can read offers"
  on public.service_offers for select using (auth.uid() is not null);

drop policy if exists "Offerer manages their offers" on public.service_offers;
create policy "Offerer manages their offers"
  on public.service_offers for all
  using (auth.uid() = offerer_id)
  with check (auth.uid() = offerer_id);

-- ---------------------------------------------------------------------------
-- 4. RPCs — atomic state transitions
-- ---------------------------------------------------------------------------

-- Submit an offer for an open service. Cannot offer on your own service.
-- If you already have a pending offer, it gets updated in place.
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

grant execute on function public.make_service_offer(uuid, numeric, text) to authenticated;

-- Withdraw your own pending offer.
create or replace function public.withdraw_service_offer(p_offer_id uuid)
returns public.service_offers
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_offers;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  update public.service_offers
     set status = 'withdrawn',
         updated_at = now()
   where id = p_offer_id
     and offerer_id = v_uid
     and status = 'pending'
   returning * into v_row;

  if v_row.id is null then raise exception 'Cannot withdraw this offer'; end if;
  return v_row;
end $$;

grant execute on function public.withdraw_service_offer(uuid) to authenticated;

-- Reject a pending offer (only the service author).
create or replace function public.reject_service_offer(p_offer_id uuid)
returns public.service_offers
language plpgsql security definer set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_row        public.service_offers;
  v_svc_author uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Fetch the offer row first (record variable must be alone in INTO).
  select * into v_row
    from public.service_offers
   where id = p_offer_id;

  if v_row.id is null then raise exception 'Offer not found'; end if;

  -- Then fetch the service author separately into a scalar.
  select author_id into v_svc_author
    from public.community_posts
   where id = v_row.service_id;

  if v_svc_author <> v_uid then raise exception 'Only the requester can reject offers'; end if;

  update public.service_offers
     set status = 'rejected', updated_at = now()
   where id = p_offer_id and status = 'pending'
   returning * into v_row;

  if v_row.id is null then raise exception 'Offer is not pending'; end if;
  return v_row;
end $$;

grant execute on function public.reject_service_offer(uuid) to authenticated;

-- Accept an offer:
--  • verifies caller is the service author;
--  • marks the chosen offer accepted;
--  • marks all OTHER pending offers on the same service as rejected;
--  • flips the service to 'claimed' with claimed_by = offerer
--    and stores accepted_amount.
create or replace function public.accept_service_offer(p_offer_id uuid)
returns public.community_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_offer  public.service_offers;
  v_svc    public.community_posts;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_offer from public.service_offers where id = p_offer_id;
  if v_offer.id is null then raise exception 'Offer not found'; end if;
  if v_offer.status <> 'pending' then raise exception 'Offer is not pending'; end if;

  select * into v_svc from public.community_posts where id = v_offer.service_id;
  if v_svc.id is null or v_svc.post_type <> 'service' then
    raise exception 'Service not found';
  end if;
  if v_svc.author_id <> v_uid then
    raise exception 'Only the requester can accept offers';
  end if;
  if v_svc.service_status <> 'open' then
    raise exception 'Service is no longer open';
  end if;

  -- Mark winner.
  update public.service_offers
     set status = 'accepted', updated_at = now()
   where id = p_offer_id;

  -- Auto-reject all other pending offers for this service.
  update public.service_offers
     set status = 'rejected', updated_at = now()
   where service_id = v_offer.service_id
     and id <> p_offer_id
     and status = 'pending';

  -- Promote service to claimed at the agreed amount.
  update public.community_posts
     set service_status = 'claimed',
         claimed_by     = v_offer.offerer_id,
         claimed_at     = now(),
         accepted_amount = v_offer.amount,
         updated_at     = now()
   where id = v_offer.service_id
   returning * into v_svc;

  return v_svc;
end $$;

grant execute on function public.accept_service_offer(uuid) to authenticated;
