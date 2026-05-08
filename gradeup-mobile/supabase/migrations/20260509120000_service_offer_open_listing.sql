-- =============================================================================
-- Open listing offers: reusable provider proposals + usage count
-- =============================================================================
-- • offer_kind: 'exclusive' (default) = one acceptance wins the job (existing).
-- • offer_kind: 'open_listing' = stays pending; users record "I've used this";
--   does not claim the service. Usage is tracked in service_offer_usages.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Column on service_offers
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.service_offers
    add column offer_kind text not null default 'exclusive'
      check (offer_kind in ('exclusive', 'open_listing'));
exception
  when duplicate_column then null;
end $$;

comment on column public.service_offers.offer_kind is
  'exclusive = normal bid (one accept wins). open_listing = visible reusable offer; use record_service_offer_use instead of accept.';

-- ---------------------------------------------------------------------------
-- 2. Usage records (one row per user per offer)
-- ---------------------------------------------------------------------------
create table if not exists public.service_offer_usages (
  offer_id uuid not null references public.service_offers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (offer_id, user_id)
);

create index if not exists idx_service_offer_usages_offer on public.service_offer_usages(offer_id);
create index if not exists idx_service_offer_usages_user on public.service_offer_usages(user_id);

alter table public.service_offer_usages enable row level security;

drop policy if exists "Authenticated read offer usages" on public.service_offer_usages;
create policy "Authenticated read offer usages"
  on public.service_offer_usages for select
  using (auth.uid() is not null);

-- Inserts only via security definer RPC (no direct insert policy).

-- ---------------------------------------------------------------------------
-- 3. make_service_offer — add p_offer_kind; replace 3-arg overload
-- ---------------------------------------------------------------------------
drop function if exists public.make_service_offer(uuid, numeric, text);

create or replace function public.make_service_offer(
  p_service_id uuid,
  p_amount numeric,
  p_message text default null,
  p_offer_kind text default 'exclusive'
)
returns public.service_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_offers;
  v_svc public.community_posts;
  v_kind text := coalesce(nullif(trim(p_offer_kind), ''), 'exclusive');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  if v_kind not in ('exclusive', 'open_listing') then
    raise exception 'Invalid offer kind';
  end if;

  select * into v_svc from public.community_posts
   where id = p_service_id and post_type = 'service';
  if v_svc.id is null then raise exception 'Service not found'; end if;
  if v_svc.author_id = v_uid then raise exception 'Cannot offer on your own service'; end if;
  if v_svc.service_status <> 'open' then raise exception 'Service is no longer accepting offers'; end if;
  if v_svc.price_type = 'free' then raise exception 'Free services do not accept monetary offers. Claim it directly.'; end if;

  update public.service_offers
     set amount = p_amount,
         message = p_message,
         offer_kind = v_kind,
         updated_at = now()
   where service_id = p_service_id
     and offerer_id = v_uid
     and status = 'pending'
   returning * into v_row;

  if v_row.id is null then
    insert into public.service_offers (
      service_id, offerer_id, amount, currency, message, offer_kind
    )
    values (
      p_service_id,
      v_uid,
      p_amount,
      coalesce(v_svc.currency, 'MYR'),
      p_message,
      v_kind
    )
    returning * into v_row;
  end if;

  return v_row;
end $$;

grant execute on function public.make_service_offer(uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. accept_service_offer — refuse open listings
-- ---------------------------------------------------------------------------
create or replace function public.accept_service_offer(p_offer_id uuid)
returns public.community_posts
language plpgsql
security definer
set search_path = public
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
  if v_offer.offer_kind = 'open_listing' then
    raise exception 'Open listing offers cannot be accepted as the job winner. Use “I''ve used this” instead.';
  end if;

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

  update public.service_offers
     set status = 'accepted', updated_at = now()
   where id = p_offer_id;

  update public.service_offers
     set status = 'rejected', updated_at = now()
   where service_id = v_offer.service_id
     and id <> p_offer_id
     and status = 'pending';

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

-- ---------------------------------------------------------------------------
-- 5. Record usage on an open listing (idempotent per user)
-- ---------------------------------------------------------------------------
create or replace function public.record_service_offer_use(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.service_offers;
  v_svc public.community_posts;
  v_cnt bigint;
  v_ins uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_offer from public.service_offers where id = p_offer_id;
  if v_offer.id is null then raise exception 'Offer not found'; end if;
  if v_offer.status <> 'pending' then raise exception 'Offer is no longer active'; end if;
  if v_offer.offer_kind <> 'open_listing' then
    raise exception 'Only open listing offers support this action';
  end if;
  if v_offer.offerer_id = v_uid then
    raise exception 'You cannot record use on your own offer';
  end if;

  select * into v_svc from public.community_posts where id = v_offer.service_id;
  if v_svc.id is null or v_svc.post_type <> 'service' then
    raise exception 'Service not found';
  end if;
  if v_svc.service_status <> 'open' then
    raise exception 'This service is no longer open';
  end if;

  v_ins := null;
  insert into public.service_offer_usages (offer_id, user_id)
  values (p_offer_id, v_uid)
  on conflict (offer_id, user_id) do nothing
  returning offer_id into v_ins;

  select count(*)::bigint into v_cnt from public.service_offer_usages where offer_id = p_offer_id;

  return jsonb_build_object(
    'usage_count', v_cnt,
    'newly_recorded', v_ins is not null
  );
end $$;

grant execute on function public.record_service_offer_use(uuid) to authenticated;
