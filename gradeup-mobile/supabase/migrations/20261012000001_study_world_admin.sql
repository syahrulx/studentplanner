-- =============================================================================
-- Study World: admin control (items, maps, coin packs, settings, bans, reports).
--
-- Study World lives on the Rencana website (repo "Rencana.-main", route
-- /app/world). That repo owns public.study_world_profiles
-- (its migration 202610120001_study_world_profiles.sql) — RUN THAT ONE FIRST.
-- This file adds what the admin website needs to run the world:
--
--   1. study_world_items       — every avatar item, hair dye and café menu item:
--                                name, tier, coin price, demo RM price, and
--                                status (available / coming_soon / hidden).
--   2. study_world_maps        — which maps are open, coming soon or hidden.
--   3. study_world_coin_packs  — coin packs for the shop. DEMO ONLY: no real
--                                payment happens. Syahrul owns real pricing and
--                                the payment flow.
--   4. study_world_settings    — one row: world open/closed, chat, shop, etc.
--   5. study_world_bans        — who may not enter the world, why, until when.
--   6. study_world_reports     — player reports, sent from the website.
--   7. study_world_admin_log   — every admin change above, with who and why.
--
-- ACCESS MODEL
--   * Items, maps, coin packs and settings are not private: anyone may read
--     them (the website must read them before sign-in finishes). Only admins
--     may write, through RLS policies that call is_admin() ONCE per statement
--     ((select public.is_admin()) is cached as an init plan). These tables are
--     tiny, so this is not the per-row cost described in
--     20260923000001_profiles_rls_hot_path.sql.
--   * Bans, reports and the admin log have RLS on and NO policies. They are
--     reached only through the SECURITY DEFINER functions below, each of which
--     checks is_admin() (or auth.uid() for the player functions) at the top.
--   * Coins and owned items are still NOT stored anywhere server-side. Real
--     coins and purchases must be granted by the server once payments are
--     live; nothing here lets a browser write a balance.
--
-- Nothing in this file deletes or changes existing user data. Seeds use
-- ON CONFLICT DO NOTHING so re-running it never overwrites admin edits.
-- =============================================================================

-- ─── 1. Items ────────────────────────────────────────────────────────────────

create table if not exists public.study_world_items (
  id          uuid primary key default gen_random_uuid(),
  -- Avatar categories match the website's CATALOG keys. hair_dye = premium
  -- hair colours; drink / snack = the café menu.
  category    text not null check (category in (
                'hair','eyes','top','bottom','shoes','head','face','back','pet','effect',
                'hair_dye','drink','snack')),
  -- Must match the id the website draws (e.g. 'ponytail'). A new key with no
  -- drawing in the website code shows as "coming soon" and cannot be worn.
  item_key    text not null check (item_key ~ '^[a-z0-9_-]{1,32}$'),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  description text check (description is null or char_length(description) <= 200),
  emoji       text check (emoji is null or char_length(emoji) <= 8),
  tier        text not null default 'free' check (tier in ('free','coins','premium')),
  price_coins int  check (price_coins is null or price_coins between 0 and 100000),
  -- DEMO price in RM for a direct purchase. Not charged anywhere yet.
  price_myr   numeric(8,2) check (price_myr is null or price_myr between 0 and 9999),
  status      text not null default 'available'
                check (status in ('available','coming_soon','hidden')),
  release_at  timestamptz,
  featured    boolean not null default false,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (category, item_key),
  -- A coins item needs a coin price.
  check (tier <> 'coins' or price_coins is not null)
);

-- ─── 2. Maps ─────────────────────────────────────────────────────────────────

create table if not exists public.study_world_maps (
  map_key     text primary key check (map_key ~ '^[a-z0-9_-]{1,32}$'),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  description text check (description is null or char_length(description) <= 200),
  status      text not null default 'available'
                check (status in ('available','coming_soon','hidden')),
  pro_only    boolean not null default false,
  room_limit  int not null default 50 check (room_limit between 2 and 500),
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- ─── 3. Coin packs (DEMO) ────────────────────────────────────────────────────

create table if not exists public.study_world_coin_packs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  coins       int  not null check (coins between 1 and 1000000),
  bonus_coins int  not null default 0 check (bonus_coins between 0 and 1000000),
  price_myr   numeric(8,2) not null check (price_myr between 0 and 9999),
  status      text not null default 'coming_soon'
                check (status in ('available','coming_soon','hidden')),
  best_value  boolean not null default false,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- ─── 4. Settings (one row) ───────────────────────────────────────────────────

create table if not exists public.study_world_settings (
  id                 boolean primary key default true check (id),
  world_open         boolean not null default true,
  closed_message     text check (closed_message is null or char_length(closed_message) <= 300),
  chat_enabled       boolean not null default true,
  shop_enabled       boolean not null default true,
  reports_enabled    boolean not null default true,
  starter_coins      int not null default 300 check (starter_coins between 0 and 100000),
  -- DEMO prices for the premium pass. Syahrul sets the real ones.
  premium_monthly_myr numeric(8,2) check (premium_monthly_myr is null or premium_monthly_myr between 0 and 9999),
  premium_yearly_myr  numeric(8,2) check (premium_yearly_myr  is null or premium_yearly_myr  between 0 and 9999),
  announcement       text check (announcement is null or char_length(announcement) <= 300),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);

insert into public.study_world_settings (id, premium_monthly_myr, premium_yearly_myr)
values (true, 4.90, 49.00)
on conflict (id) do nothing;

-- ─── 5. Bans ─────────────────────────────────────────────────────────────────

create table if not exists public.study_world_bans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  reason      text not null check (char_length(btrim(reason)) between 3 and 500),
  -- null = until an admin lifts it.
  expires_at  timestamptz,
  banned_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  lifted_at   timestamptz,
  lifted_by   uuid references auth.users(id) on delete set null,
  lift_reason text check (lift_reason is null or char_length(lift_reason) <= 500)
);

-- At most one open (not lifted) ban per person. An expired ban stays "open"
-- until it is replaced or lifted; is_active below checks the expiry.
create unique index if not exists study_world_bans_one_open
  on public.study_world_bans (user_id) where lifted_at is null;

-- ─── 6. Reports ──────────────────────────────────────────────────────────────

create table if not exists public.study_world_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid references auth.users(id) on delete set null,
  -- Filled when the website knows the account (real multiplayer). In the
  -- preview the website only knows the nickname, so admins match it by hand.
  reported_user_id  uuid references auth.users(id) on delete set null,
  reported_nickname text check (reported_nickname is null or char_length(reported_nickname) <= 32),
  reason            text not null check (reason in (
                      'harassment','spam','inappropriate_name','inappropriate_avatar',
                      'cheating','contact_sharing','other')),
  details           text check (details is null or char_length(details) <= 1000),
  map_key           text check (map_key is null or char_length(map_key) <= 32),
  room              text check (room is null or char_length(room) <= 60),
  status            text not null default 'open'
                      check (status in ('open','reviewing','actioned','dismissed')),
  admin_note        text check (admin_note is null or char_length(admin_note) <= 1000),
  handled_by        uuid references auth.users(id) on delete set null,
  handled_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists study_world_reports_status_idx
  on public.study_world_reports (status, created_at desc);
create index if not exists study_world_reports_reporter_idx
  on public.study_world_reports (reporter_id, created_at desc);

-- ─── 7. Admin log ────────────────────────────────────────────────────────────

create table if not exists public.study_world_admin_log (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid references auth.users(id) on delete set null,
  action         text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target         text,
  reason         text,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists study_world_admin_log_created_idx
  on public.study_world_admin_log (created_at desc);

-- ─── Access ──────────────────────────────────────────────────────────────────

alter table public.study_world_items      enable row level security;
alter table public.study_world_maps       enable row level security;
alter table public.study_world_coin_packs enable row level security;
alter table public.study_world_settings   enable row level security;
alter table public.study_world_bans       enable row level security;
alter table public.study_world_reports    enable row level security;
alter table public.study_world_admin_log  enable row level security;

revoke all on public.study_world_bans, public.study_world_reports, public.study_world_admin_log
  from anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['study_world_items','study_world_maps','study_world_coin_packs','study_world_settings']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_admin_delete', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Stamp who changed a config row and log it, so the admin website does not
-- have to remember to.
create or replace function public.study_world_config_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_target text := coalesce(v_row ->> 'item_key', v_row ->> 'map_key', v_row ->> 'name', tg_table_name);
begin
  if tg_op <> 'DELETE' then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  insert into public.study_world_admin_log (admin_id, action, target, details)
  values (
    auth.uid(),
    lower(tg_op) || ':' || replace(tg_table_name, 'study_world_', ''),
    case when v_row ? 'category' then (v_row ->> 'category') || ':' || v_target else v_target end,
    case
      when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
      when tg_op = 'INSERT' then jsonb_build_object('after', to_jsonb(new))
      else jsonb_build_object('before', to_jsonb(old))
    end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['study_world_items','study_world_maps','study_world_coin_packs','study_world_settings']
  loop
    execute format('drop trigger if exists trg_%s_audit on public.%I', t, t);
    execute format('create trigger trg_%s_audit before insert or update or delete on public.%I for each row execute function public.study_world_config_audit()', t, t);
  end loop;
end;
$$;

-- ─── Seeds: today's website catalogue, unchanged ─────────────────────────────
-- Copied from Rencana.-main src/lib/study-world/avatar.ts and InteractPanel.tsx
-- on 2026-10-12. The seed runs before the audit trigger matters (auth.uid() is
-- null in the SQL editor), so the log shows these as system inserts.

insert into public.study_world_items (category, item_key, name, tier, price_coins, sort_order) values
  ('hair','short','Short','free',null,10), ('hair','spiky','Spiky','free',null,20),
  ('hair','long','Long','free',null,30), ('hair','curly','Curly','free',null,40),
  ('hair','bun','Bun','free',null,50), ('hair','ponytail','Ponytail','coins',40,60),
  ('hair','twintails','Twin tails','coins',60,70), ('hair','mohawk','Mohawk','coins',60,80),
  ('eyes','round','Round','free',null,10), ('eyes','happy','Happy','free',null,20),
  ('eyes','sleepy','Sleepy','free',null,30), ('eyes','wink','Wink','coins',30,40),
  ('eyes','sparkle','Star eyes','premium',null,50), ('eyes','cat','Cat eyes','premium',null,60),
  ('top','tee','T-shirt','free',null,10), ('top','hoodie','Hoodie','free',null,20),
  ('top','uniform','Uniform','free',null,30), ('top','varsity','Varsity','coins',80,40),
  ('top','kimono','Kimono','premium',null,50), ('top','royal','Royal coat','premium',null,60),
  ('top','neon','Neon jacket','premium',null,70), ('top','astro','Astronaut','premium',null,80),
  ('bottom','pants','Pants','free',null,10), ('bottom','shorts','Shorts','free',null,20),
  ('bottom','skirt','Skirt','free',null,30), ('bottom','cargo','Cargo','coins',50,40),
  ('bottom','starry','Starry','premium',null,50),
  ('shoes','sneakers','Sneakers','free',null,10), ('shoes','boots','Boots','free',null,20),
  ('shoes','slippers','Slippers','coins',30,30), ('shoes','rocket','Rocket boots','premium',null,40),
  ('head','none','None','free',null,0), ('head','cap','Cap','free',null,10),
  ('head','flowers','Flowers','free',null,20), ('head','beanie','Beanie','coins',50,30),
  ('head','phones','Headphones','coins',60,40), ('head','catears','Cat ears','coins',80,50),
  ('head','crown','Gold crown','premium',null,60), ('head','halo','Halo','premium',null,70),
  ('head','wizard','Wizard hat','premium',null,80),
  ('face','none','None','free',null,0), ('face','glasses','Glasses','free',null,10),
  ('face','shades','Shades','coins',40,20), ('face','hearts','Heart specs','premium',null,30),
  ('face','visor','Cyber visor','premium',null,40),
  ('back','none','None','free',null,0), ('back','backpack','Backpack','free',null,10),
  ('back','guitar','Guitar','coins',90,20), ('back','cape','Hero cape','premium',null,30),
  ('back','wings','Angel wings','premium',null,40), ('back','bat','Bat wings','premium',null,50),
  ('pet','none','None','free',null,0), ('pet','chick','Chick','free',null,10),
  ('pet','cat','Cat','coins',150,20), ('pet','dragon','Baby dragon','premium',null,30),
  ('pet','ghost','Ghosty','premium',null,40),
  ('effect','none','None','free',null,0), ('effect','sparkle','Gold sparkle','premium',null,10),
  ('effect','hearts','Hearts','premium',null,20), ('effect','sakura','Sakura','premium',null,30),
  ('effect','snow','Snowfall','premium',null,40),
  ('hair_dye','galaxy','Galaxy dye','premium',null,10),
  ('hair_dye','rainbow','Rainbow dye','premium',null,20)
on conflict (category, item_key) do nothing;

insert into public.study_world_items (category, item_key, name, emoji, tier, price_coins, sort_order) values
  ('drink','iced-latte','Iced latte','🧋','coins',10,10),
  ('drink','matcha','Matcha','🍵','coins',12,20),
  ('drink','teh-tarik','Teh tarik','☕','coins',8,30),
  ('drink','hot-chocolate','Hot chocolate','🍫','coins',10,40),
  ('snack','onigiri','Onigiri','🍙','coins',6,10),
  ('snack','cookie','Cookie','🍪','coins',4,20),
  ('snack','fruit-cup','Fruit cup','🍓','coins',5,30),
  ('snack','crisps','Crisps','🥨','coins',5,40)
on conflict (category, item_key) do nothing;

insert into public.study_world_maps (map_key, name, description, sort_order) values
  ('campus','Campus','Plaza, quiz deck, pond and paths',10),
  ('classroom','Classroom','Quiz arena and group study',20),
  ('cafe','Café','Chat, lo-fi music and games',30),
  ('library','Library','Quiet focus with shared timers',40),
  ('garden','Garden','Grow plants with your streak',50)
on conflict (map_key) do nothing;

-- DEMO packs so the admin page has something to edit. They start as
-- "coming soon" so the website never offers them for sale.
insert into public.study_world_coin_packs (name, coins, bonus_coins, price_myr, status, best_value, sort_order)
select * from (values
  ('Handful', 100, 0, 1.90::numeric, 'coming_soon', false, 10),
  ('Bag', 550, 50, 9.90::numeric, 'coming_soon', true, 20),
  ('Chest', 1200, 200, 19.90::numeric, 'coming_soon', false, 30)
) as v(name, coins, bonus_coins, price_myr, status, best_value, sort_order)
where not exists (select 1 from public.study_world_coin_packs);

-- ─── Player functions (called by the website) ────────────────────────────────

/** Is the signed-in player banned from Study World right now? */
create or replace function public.study_world_my_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ban public.study_world_bans;
begin
  if auth.uid() is null then
    return jsonb_build_object('banned', false);
  end if;
  select * into v_ban
  from public.study_world_bans b
  where b.user_id = auth.uid()
    and b.lifted_at is null
    and (b.expires_at is null or b.expires_at > now())
  limit 1;
  if v_ban.id is null then
    return jsonb_build_object('banned', false);
  end if;
  return jsonb_build_object('banned', true, 'reason', v_ban.reason, 'expires_at', v_ban.expires_at);
end;
$$;

/** Send a report about another player. Max 20 per reporter per day. */
create or replace function public.study_world_report(
  p_reason text,
  p_nickname text default null,
  p_details text default null,
  p_map_key text default null,
  p_room text default null,
  p_reported_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to send a report.' using errcode = '42501';
  end if;
  if not coalesce((select s.reports_enabled from public.study_world_settings s limit 1), true) then
    raise exception 'Reports are paused right now.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.study_world_reports r
      where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have sent a lot of reports today. Please try again tomorrow.' using errcode = 'P0001';
  end if;
  if p_reported_user_id = auth.uid() then
    raise exception 'You cannot report yourself.' using errcode = 'P0001';
  end if;

  insert into public.study_world_reports
    (reporter_id, reported_user_id, reported_nickname, reason, details, map_key, room)
  values (
    auth.uid(),
    p_reported_user_id,
    nullif(left(btrim(coalesce(p_nickname, '')), 32), ''),
    p_reason,
    nullif(left(btrim(coalesce(p_details, '')), 1000), ''),
    nullif(left(btrim(coalesce(p_map_key, '')), 32), ''),
    nullif(left(btrim(coalesce(p_room, '')), 60), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.study_world_my_status() from public, anon;
revoke all on function public.study_world_report(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.study_world_my_status() to authenticated;
grant execute on function public.study_world_report(text, text, text, text, text, uuid) to authenticated;

-- ─── Admin functions ─────────────────────────────────────────────────────────
-- Each checks is_admin() once, at the top.

create or replace function public.admin_study_world_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'players', (select count(*) from public.study_world_profiles),
    'players_7d', (select count(*) from public.study_world_profiles where updated_at > now() - interval '7 days'),
    'active_bans', (select count(*) from public.study_world_bans
                    where lifted_at is null and (expires_at is null or expires_at > now())),
    'open_reports', (select count(*) from public.study_world_reports where status in ('open','reviewing')),
    'items_available', (select count(*) from public.study_world_items where status = 'available'),
    'items_coming_soon', (select count(*) from public.study_world_items where status = 'coming_soon'),
    'items_hidden', (select count(*) from public.study_world_items where status = 'hidden'),
    'maps_available', (select count(*) from public.study_world_maps where status = 'available')
  );
end;
$$;

/** Players with an avatar. Search by nickname, name, email or user id. */
create or replace function public.admin_study_world_players(
  p_query text default null,
  p_filter text default 'all',
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  user_id uuid,
  nickname text,
  show_real_name boolean,
  look jsonb,
  updated_at timestamptz,
  name text,
  email text,
  banned boolean,
  ban_reason text,
  ban_expires_at timestamptz,
  report_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_raw text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text;
  v_uuid uuid;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if v_raw is not null then
    v_like := '%' || replace(replace(v_raw, '%', '\%'), '_', '\_') || '%';
    begin
      v_uuid := v_raw::uuid;
    exception when others then
      v_uuid := null;
    end;
  end if;

  return query
  with base as (
    select
      w.user_id, w.nickname, w.show_real_name, w.look, w.updated_at,
      p.name, u.email::text as email,
      b.id is not null as banned, b.reason as ban_reason, b.expires_at as ban_expires_at,
      (select count(*) from public.study_world_reports r
        where r.reported_user_id = w.user_id
           or lower(r.reported_nickname) = lower(w.nickname)) as report_count
    from public.study_world_profiles w
    left join public.profiles p on p.id = w.user_id
    left join auth.users u on u.id = w.user_id
    left join public.study_world_bans b
      on b.user_id = w.user_id and b.lifted_at is null
     and (b.expires_at is null or b.expires_at > now())
    where v_raw is null
       or w.user_id = v_uuid
       or w.nickname ilike v_like
       or p.name ilike v_like
       or u.email ilike v_like
  ), filtered as (
    select * from base
    where case coalesce(p_filter, 'all')
      when 'banned' then base.banned
      when 'reported' then base.report_count > 0
      else true end
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.banned desc, f.report_count desc, f.updated_at desc
  limit v_limit offset v_offset;
end;
$$;

/**
 * Ban someone from Study World. p_days null = until lifted. Replaces any
 * existing open ban (the old one is closed with lift_reason 'replaced').
 * Works for any account, even one that has not made an avatar yet.
 */
create or replace function public.admin_study_world_ban(
  p_user_id uuid,
  p_reason text,
  p_days int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_expires timestamptz := case when p_days is null then null else now() + make_interval(days => p_days) end;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'No account with that id.' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot ban yourself.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason (at least 3 characters).' using errcode = 'P0001';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception 'Days must be between 1 and 3650.' using errcode = 'P0001';
  end if;

  update public.study_world_bans
     set lifted_at = now(), lifted_by = auth.uid(), lift_reason = 'replaced'
   where user_id = p_user_id and lifted_at is null;

  insert into public.study_world_bans (user_id, reason, expires_at, banned_by)
  values (p_user_id, btrim(p_reason), v_expires, auth.uid())
  returning id into v_id;

  insert into public.study_world_admin_log (admin_id, action, target_user_id, reason, details)
  values (auth.uid(), 'ban', p_user_id, btrim(p_reason),
          jsonb_build_object('ban_id', v_id, 'days', p_days, 'expires_at', v_expires));
  return v_id;
end;
$$;

create or replace function public.admin_study_world_unban(
  p_user_id uuid,
  p_reason text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  update public.study_world_bans
     set lifted_at = now(), lifted_by = auth.uid(),
         lift_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '')
   where user_id = p_user_id and lifted_at is null;
  get diagnostics v_count = row_count;
  insert into public.study_world_admin_log (admin_id, action, target_user_id, reason, details)
  values (auth.uid(), 'unban', p_user_id, p_reason, jsonb_build_object('lifted', v_count));
  return v_count;
end;
$$;

create or replace function public.admin_study_world_bans(p_include_past boolean default false)
returns table(
  id uuid, user_id uuid, nickname text, name text, email text,
  reason text, expires_at timestamptz, created_at timestamptz, banned_by_email text,
  lifted_at timestamptz, lift_reason text, active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
  select b.id, b.user_id, w.nickname, p.name, u.email::text, b.reason, b.expires_at, b.created_at,
         a.email::text, b.lifted_at, b.lift_reason,
         (b.lifted_at is null and (b.expires_at is null or b.expires_at > now())) as active
  from public.study_world_bans b
  left join public.study_world_profiles w on w.user_id = b.user_id
  left join public.profiles p on p.id = b.user_id
  left join auth.users u on u.id = b.user_id
  left join auth.users a on a.id = b.banned_by
  where p_include_past or (b.lifted_at is null and (b.expires_at is null or b.expires_at > now()))
  order by b.created_at desc
  limit 500;
end;
$$;

/**
 * Fix someone's avatar: reset the look to the default and/or change a bad
 * nickname. updated_at moves to now so the website treats this as the newest
 * copy and replaces what is saved in the player's browser.
 */
create or replace function public.admin_study_world_fix_avatar(
  p_user_id uuid,
  p_reset_look boolean,
  p_new_nickname text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := nullif(btrim(coalesce(p_new_nickname, '')), '');
  v_before public.study_world_profiles;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason (at least 3 characters).' using errcode = 'P0001';
  end if;
  if v_nick is not null and (char_length(v_nick) not between 3 and 16 or v_nick ~ '\s') then
    raise exception 'Nickname must be 3–16 characters with no spaces.' using errcode = 'P0001';
  end if;
  if not coalesce(p_reset_look, false) and v_nick is null then
    raise exception 'Nothing to change.' using errcode = 'P0001';
  end if;

  select * into v_before from public.study_world_profiles where user_id = p_user_id;
  if v_before.user_id is null then
    raise exception 'This person has no Study World avatar.' using errcode = 'P0001';
  end if;

  update public.study_world_profiles
     set look = case when p_reset_look then '{}'::jsonb else look end,
         nickname = coalesce(v_nick, nickname),
         updated_at = now()
   where user_id = p_user_id;

  insert into public.study_world_admin_log (admin_id, action, target_user_id, target, reason, details)
  values (auth.uid(), 'fix_avatar', p_user_id, v_before.nickname, btrim(p_reason),
          jsonb_build_object('reset_look', coalesce(p_reset_look, false),
                             'old_nickname', v_before.nickname, 'new_nickname', v_nick,
                             'old_look', v_before.look));
  return true;
end;
$$;

create or replace function public.admin_study_world_reports(p_status text default 'open')
returns table(
  id uuid, created_at timestamptz, reason text, details text, map_key text, room text,
  status text, admin_note text, handled_at timestamptz,
  reporter_id uuid, reporter_nickname text, reporter_email text,
  reported_user_id uuid, reported_nickname text,
  -- Accounts whose current nickname matches the reported one (nicknames are
  -- not unique, so this can be 0, 1 or several).
  nickname_matches jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
  select r.id, r.created_at, r.reason, r.details, r.map_key, r.room, r.status, r.admin_note, r.handled_at,
         r.reporter_id, rw.nickname, ru.email::text,
         r.reported_user_id, r.reported_nickname,
         coalesce((
           select jsonb_agg(jsonb_build_object('user_id', w.user_id, 'nickname', w.nickname,
                                               'email', u.email, 'name', p.name))
           from public.study_world_profiles w
           left join auth.users u on u.id = w.user_id
           left join public.profiles p on p.id = w.user_id
           where w.user_id = r.reported_user_id
              or (r.reported_nickname is not null and lower(w.nickname) = lower(r.reported_nickname))
         ), '[]'::jsonb)
  from public.study_world_reports r
  left join public.study_world_profiles rw on rw.user_id = r.reporter_id
  left join auth.users ru on ru.id = r.reporter_id
  where coalesce(p_status, 'all') = 'all'
     or (p_status = 'open' and r.status in ('open','reviewing'))
     or r.status = p_status
  order by r.created_at desc
  limit 500;
end;
$$;

create or replace function public.admin_study_world_update_report(
  p_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_status not in ('open','reviewing','actioned','dismissed') then
    raise exception 'Unknown status.' using errcode = 'P0001';
  end if;
  update public.study_world_reports
     set status = p_status,
         admin_note = coalesce(nullif(left(btrim(coalesce(p_note, '')), 1000), ''), admin_note),
         handled_by = auth.uid(),
         handled_at = now()
   where id = p_id;
  if not found then
    raise exception 'Report not found.' using errcode = 'P0001';
  end if;
  insert into public.study_world_admin_log (admin_id, action, target, reason, details)
  values (auth.uid(), 'report:' || p_status, p_id::text, p_note, '{}'::jsonb);
  return true;
end;
$$;

create or replace function public.admin_study_world_log(p_limit int default 100)
returns table(
  id uuid, created_at timestamptz, admin_email text, action text,
  target_user_id uuid, target text, reason text, details jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
  select l.id, l.created_at, u.email::text, l.action, l.target_user_id, l.target, l.reason, l.details
  from public.study_world_admin_log l
  left join auth.users u on u.id = l.admin_id
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_study_world_overview()',
    'public.admin_study_world_players(text, text, int, int)',
    'public.admin_study_world_ban(uuid, text, int)',
    'public.admin_study_world_unban(uuid, text)',
    'public.admin_study_world_bans(boolean)',
    'public.admin_study_world_fix_avatar(uuid, boolean, text, text)',
    'public.admin_study_world_reports(text)',
    'public.admin_study_world_update_report(uuid, text, text)',
    'public.admin_study_world_log(int)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

revoke all on function public.study_world_config_audit() from public, anon, authenticated;

-- Let the website pick up admin changes without a reload.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table
        public.study_world_items, public.study_world_maps,
        public.study_world_coin_packs, public.study_world_settings;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
