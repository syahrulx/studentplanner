-- =============================================================================
-- Negotiation mode on the service post (author chooses at create time)
-- =============================================================================
-- • standard (default): exclusive offers; one acceptance wins (existing).
-- • open_service: offers behave as open listings + usage count; post auto-ends
--   after 7 days (open_service_expires_at). Author creates a new post to renew.
-- Offer rows still store offer_kind for RLS/UI; make_service_offer derives it
-- from community_posts.service_negotiation_mode (offerers do not pick).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns on community_posts
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.community_posts
    add column service_negotiation_mode text not null default 'standard'
      check (service_negotiation_mode in ('standard', 'open_service'));
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.community_posts add column open_service_expires_at timestamptz;
exception
  when duplicate_column then null;
end $$;

comment on column public.community_posts.service_negotiation_mode is
  'standard = exclusive bids. open_service = reusable listings + usages; expires at open_service_expires_at.';
comment on column public.community_posts.open_service_expires_at is
  'When negotiation mode is open_service, offers close after this time (typically created_at + 7 days).';

-- ---------------------------------------------------------------------------
-- 2. Expire stale open-service posts (reject pending offers)
-- ---------------------------------------------------------------------------
create or replace function public.sync_open_service_expiry(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.community_posts
     set service_status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now()),
         updated_at = now()
   where id = p_service_id
     and post_type = 'service'
     and service_negotiation_mode = 'open_service'
     and open_service_expires_at is not null
     and open_service_expires_at < now()
     and service_status = 'open';

  get diagnostics v_n = row_count;
  if v_n > 0 then
    update public.service_offers
       set status = 'rejected', updated_at = now()
     where service_id = p_service_id
       and status = 'pending';
  end if;
end $$;

grant execute on function public.sync_open_service_expiry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. make_service_offer — derive offer_kind from service; 3-arg only
-- ---------------------------------------------------------------------------
drop function if exists public.make_service_offer(uuid, numeric, text, text);

create or replace function public.make_service_offer(
  p_service_id uuid,
  p_amount numeric,
  p_message text default null
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
  v_kind text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  perform public.sync_open_service_expiry(p_service_id);

  select * into v_svc from public.community_posts
   where id = p_service_id and post_type = 'service';
  if v_svc.id is null then raise exception 'Service not found'; end if;
  if v_svc.author_id = v_uid then raise exception 'Cannot offer on your own service'; end if;
  if v_svc.service_status <> 'open' then raise exception 'Service is no longer accepting offers'; end if;
  if v_svc.price_type = 'free' then raise exception 'Free services do not accept monetary offers. Claim it directly.'; end if;

  if coalesce(v_svc.service_negotiation_mode, 'standard') = 'open_service' then
    v_kind := 'open_listing';
  else
    v_kind := 'exclusive';
  end if;

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

grant execute on function public.make_service_offer(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. record_service_offer_use — sync expiry before checks
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

  perform public.sync_open_service_expiry(v_offer.service_id);

  select * into v_offer from public.service_offers where id = p_offer_id;
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

-- ---------------------------------------------------------------------------
-- 5. accept_service_offer — expire open posts before accepting
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

  perform public.sync_open_service_expiry(v_offer.service_id);

  select * into v_offer from public.service_offers where id = p_offer_id;
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
