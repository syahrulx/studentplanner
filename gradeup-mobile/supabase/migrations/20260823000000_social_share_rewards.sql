-- =============================================================================
-- 20260823000000: Social share rewards ("post about Rencana, earn free Plus")
-- =============================================================================
-- Users post about Rencana on Threads/X/Facebook/Instagram/TikTok, submit the
-- post URL + claimed likes + a screenshot, and an admin verifies the live post
-- before awarding free Plus days. The grant is a provider fact like any other:
-- a 'promo' row in subscription_entitlements with an expiry, reconciled onto
-- profiles by recompute_subscription_access and swept nightly by the existing
-- subscription-expiry-sweep cron job — removing it can never erase valid
-- RevenueCat/Curlec/admin access, and it lapses on its own.
--
-- All writes go through RPCs: clients get SELECT-own only, submission is a
-- SECURITY DEFINER function returning typed {ok,error} codes the app maps to
-- copy, and review is service_role-only so the claim stamp, entitlement
-- extension, recompute, and notification commit in one transaction.

-- ─── Canonical post-URL key ──────────────────────────────────────────────────
-- Uniqueness on the raw URL is defeated by a trailing slash or ?utm= suffix,
-- so dedupe compares a normalised form instead.

create or replace function public.normalize_post_url(p_url text)
returns text
language sql immutable
as $$
  select rtrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(trim(p_url)), '^https?://', ''),
               '[?#].*$', ''
             ),
             '^www\.', ''
           ),
           '/'
         );
$$;

-- ─── Claims table ────────────────────────────────────────────────────────────

create table if not exists public.social_share_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('threads', 'x', 'facebook', 'instagram', 'tiktok')),
  post_url text not null check (char_length(post_url) between 10 and 500),
  post_url_key text not null,
  claimed_likes integer not null check (claimed_likes >= 0),
  screenshot_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_likes integer check (approved_likes is null or approved_likes >= 0),
  awarded_days integer check (awarded_days is null or awarded_days > 0),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists social_share_claims_one_per_post
  on public.social_share_claims (post_url_key);
create index if not exists social_share_claims_status_created_idx
  on public.social_share_claims (status, created_at desc);
create index if not exists social_share_claims_user_created_idx
  on public.social_share_claims (user_id, created_at desc);

alter table public.social_share_claims enable row level security;
revoke all on public.social_share_claims from anon;

drop policy if exists social_share_claims_read_own_or_admin on public.social_share_claims;
create policy social_share_claims_read_own_or_admin
  on public.social_share_claims
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

comment on table public.social_share_claims is
  'Social-post reward claims. Inserted only via submit_social_share_claim; reviewed only via review_social_share_claim (service role). The claim row doubles as the grant ledger: the pending->approved transition happens at most once per claim.';

-- ─── Private proof bucket ────────────────────────────────────────────────────
-- Unlike support-screenshots this bucket is private: proofs are personal and
-- only the claimant or an admin should ever see them. Admin UI reads via
-- signed URLs minted with the service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-proof', 'share-proof', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

drop policy if exists "Users can upload own share proof" on storage.objects;
create policy "Users can upload own share proof"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'share-proof' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users and admins can read share proof" on storage.objects;
create policy "Users and admins can read share proof"
  on storage.objects for select to authenticated
  using (bucket_id = 'share-proof'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Own-delete lets the client roll back an orphaned upload when the submit RPC
-- rejects the claim. The live post is the real evidence, so a user deleting
-- their proof after submitting only hurts their own claim.
drop policy if exists "Users and admins can delete share proof" on storage.objects;
create policy "Users and admins can delete share proof"
  on storage.objects for delete to authenticated
  using (bucket_id = 'share-proof'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ─── Submission RPC ──────────────────────────────────────────────────────────

create or replace function public.submit_social_share_claim(
  p_platform text,
  p_post_url text,
  p_claimed_likes integer,
  p_screenshot_path text
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_url text := trim(coalesce(p_post_url, ''));
  v_key text;
  v_host text;
  v_claim_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_platform not in ('threads', 'x', 'facebook', 'instagram', 'tiktok') then
    return jsonb_build_object('ok', false, 'error', 'invalid_platform');
  end if;

  if p_claimed_likes is null or p_claimed_likes < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_likes');
  end if;

  if p_screenshot_path is null or p_screenshot_path = '' then
    return jsonb_build_object('ok', false, 'error', 'screenshot_required');
  end if;

  -- Storage RLS confines writes to {uid}/, so requiring the same prefix here
  -- means a claim can only point at a file the caller actually uploaded —
  -- never at another member's proof.
  if p_screenshot_path !~ ('^' || v_user::text || '/[^/]+$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_screenshot_path');
  end if;

  if v_url !~* '^https://' or char_length(v_url) not between 10 and 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid_url');
  end if;

  v_key := public.normalize_post_url(v_url);
  v_host := split_part(split_part(v_key, '/', 1), ':', 1);

  if v_host not in (
    'threads.net', 'threads.com',
    'x.com', 'twitter.com',
    'facebook.com', 'fb.com', 'm.facebook.com',
    'instagram.com',
    'tiktok.com'
  ) then
    return jsonb_build_object('ok', false, 'error', 'host_not_allowed');
  end if;

  -- Compared on the canonical key, so a trailing slash or tracking parameter
  -- cannot be used to claim the same post twice (by anyone).
  if exists (select 1 from public.social_share_claims where post_url_key = v_key) then
    return jsonb_build_object('ok', false, 'error', 'post_already_claimed');
  end if;

  if (select count(*) from public.social_share_claims
      where user_id = v_user and status = 'pending') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many_pending');
  end if;

  -- Cooldown counts every claim including rejected ones — resubmitting spam
  -- does not reset the clock.
  if exists (
    select 1 from public.social_share_claims
    where user_id = v_user
      and platform = p_platform
      and created_at > now() - interval '30 days'
  ) then
    return jsonb_build_object('ok', false, 'error', 'platform_cooldown');
  end if;

  begin
    insert into public.social_share_claims
      (user_id, platform, post_url, post_url_key, claimed_likes, screenshot_path)
    values (v_user, p_platform, v_url, v_key, p_claimed_likes, p_screenshot_path)
    returning id into v_claim_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'post_already_claimed');
  end;

  return jsonb_build_object('ok', true, 'claim_id', v_claim_id);
end;
$$;

revoke all on function public.submit_social_share_claim(text, text, integer, text) from public, anon;
grant execute on function public.submit_social_share_claim(text, text, integer, text) to authenticated;

-- ─── Review RPC (service role only) ──────────────────────────────────────────
-- Called by the admin_data edge function after authorizeAdminRequest. Keeping
-- the claim stamp, entitlement extension, recompute, and notification in one
-- function means an approval can never half-apply.

create or replace function public.review_social_share_claim(
  p_claim_id uuid,
  p_reviewer uuid,
  p_approve boolean,
  p_approved_likes integer,
  p_awarded_days integer,
  p_note text
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_claim public.social_share_claims%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_recent integer;
  v_expires timestamptz;
begin
  select * into v_claim
  from public.social_share_claims
  where id = p_claim_id
  for update;

  if v_claim.id is null then
    return jsonb_build_object('ok', false, 'error', 'claim_not_found');
  end if;

  if v_claim.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'already_reviewed');
  end if;

  if not p_approve then
    -- The note is shown to the user, so a rejection must say why.
    if v_note is null or char_length(v_note) < 3 then
      return jsonb_build_object('ok', false, 'error', 'note_required');
    end if;

    update public.social_share_claims
    set status = 'rejected',
        review_note = v_note,
        reviewed_by = p_reviewer,
        reviewed_at = now(),
        updated_at = now()
    where id = p_claim_id;

    perform public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(v_claim.user_id::text),
      'title', 'Share reward update',
      'body', 'Your ' || v_claim.platform || ' post wasn''t approved: ' || v_note,
      'category', 'promo',
      'data', jsonb_build_object(
        'type', 'social_share_claim', 'claimId', p_claim_id, 'status', 'rejected')
    ));

    return jsonb_build_object('ok', true, 'status', 'rejected', 'user_id', v_claim.user_id);
  end if;

  if p_awarded_days is null or p_awarded_days < 1 or p_awarded_days > 180 then
    return jsonb_build_object('ok', false, 'error', 'invalid_days');
  end if;

  -- Rolling cap: at most 180 awarded days per user per 90-day window.
  select coalesce(sum(awarded_days), 0) into v_recent
  from public.social_share_claims
  where user_id = v_claim.user_id
    and status = 'approved'
    and reviewed_at > now() - interval '90 days';

  if v_recent + p_awarded_days > 180 then
    return jsonb_build_object('ok', false, 'error', 'quarterly_cap_exceeded',
                              'alreadyAwarded', v_recent, 'cap', 180);
  end if;

  update public.social_share_claims
  set status = 'approved',
      approved_likes = p_approved_likes,
      awarded_days = p_awarded_days,
      review_note = v_note,
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      updated_at = now()
  where id = p_claim_id;

  -- A promo grant is its own provider fact (like the manual 'admin' grant in
  -- admin_users), so removing or lapsing it can never erase paid access.
  -- Stacking: extend from the current promo expiry while it is still in the
  -- future, otherwise from now.
  insert into public.subscription_entitlements
    (user_id, provider, external_id, plan, status, period_type, store,
     environment, expires_at, price, updated_at)
  values
    (v_claim.user_id, 'promo', v_claim.user_id::text, 'plus', 'promotional',
     'PROMOTIONAL', 'PROMO', 'INTERNAL',
     now() + make_interval(days => p_awarded_days), 0, now())
  on conflict (user_id, provider) do update set
    plan = 'plus',
    status = 'promotional',
    expires_at = greatest(coalesce(subscription_entitlements.expires_at, now()), now())
                 + make_interval(days => p_awarded_days),
    updated_at = now();

  select expires_at into v_expires
  from public.subscription_entitlements
  where user_id = v_claim.user_id and provider = 'promo';

  perform public.recompute_subscription_access(v_claim.user_id);

  perform public._send_community_push(jsonb_build_object(
    'recipientUserIds', jsonb_build_array(v_claim.user_id::text),
    'title', 'Free Plus unlocked 🎉',
    'body', '+' || p_awarded_days || ' days of Rencana Plus for your ' || v_claim.platform || ' post.',
    'category', 'promo',
    'data', jsonb_build_object(
      'type', 'social_share_claim', 'claimId', p_claim_id,
      'status', 'approved', 'days', p_awarded_days)
  ));

  return jsonb_build_object('ok', true, 'status', 'approved',
                            'user_id', v_claim.user_id, 'expires_at', v_expires);
end;
$$;

revoke all on function public.review_social_share_claim(uuid, uuid, boolean, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.review_social_share_claim(uuid, uuid, boolean, integer, integer, text)
  to service_role;

-- ─── Allow 'promo' as an entitlement provider ────────────────────────────────
-- The constraint was created inline, so look its name up instead of assuming
-- the default. Reusing 'admin' is not an option: unique(user_id, provider)
-- would make a share reward collide with (and be wiped by) manual grants.

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'subscription_entitlements'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%revenuecat%';
  if v_name is not null then
    execute format('alter table public.subscription_entitlements drop constraint %I', v_name);
  end if;
end $$;

alter table public.subscription_entitlements
  add constraint subscription_entitlements_provider_check
  check (provider in ('revenuecat', 'admin', 'promo'));
