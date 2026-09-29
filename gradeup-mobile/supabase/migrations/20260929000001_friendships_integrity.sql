-- Friendships: one row per pair, and rules the client can't get round.
--
-- WHAT WAS WRONG
-- 1. The unique key was one-directional, (requester_id, addressee_id), so a
--    pair could hold two rows: A→B and B→A. Two people asking each other at
--    once got one each, and block_confession_author's ON CONFLICT only matched
--    its own direction, so blocking someone who had asked you added a second
--    row. The app reads a pair with .maybeSingle(), which errors on two rows —
--    and that error was ignored, so requests, blocks and unblocks for the pair
--    misbehaved from then on.
-- 2. RLS let either side UPDATE a row to anything. A requester could accept
--    their own request (a "friend" without consent), and a blocked user could
--    flip or delete the block. INSERT only checked requester_id, so a row could
--    be inserted straight as 'accepted'.
--
-- WHAT THIS DOES
-- * blocked_by: who blocked, set by trigger from auth.uid(); clients can't
--   write it. Existing blocks are left NULL — which side blocked was never
--   recorded — and a NULL block keeps today's rule (either side may remove it).
-- * Deduplicates pairs, keeping blocked > accepted > pending, then the oldest.
--   The row removed only ever repeats what the kept row says.
-- * A unique index on the unordered pair, so it cannot happen again.
-- * A guard trigger: only the addressee accepts; a block is never lifted by
--   UPDATE (unblocking is DELETE, by the blocker); participants never change.
--   Calls with no auth.uid() — SQL editor, service role — are not restricted.
-- * INSERT may only create 'pending' or 'blocked'; DELETE of a block is the
--   blocker's alone.
-- * block_confession_author / block_confession_comment_author block the pair
--   in whichever direction its row already runs, instead of adding a second.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Who blocked
-- ---------------------------------------------------------------------------
alter table public.friendships
  add column if not exists blocked_by uuid references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. One row per pair
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by least(requester_id, addressee_id), greatest(requester_id, addressee_id)
      order by
        case status when 'blocked' then 0 when 'accepted' then 1 else 2 end,
        created_at,
        id
    ) as rn
  from public.friendships
)
delete from public.friendships f
using ranked r
where f.id = r.id
  and r.rn > 1;

create unique index if not exists friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'friendships_not_self') then
    -- NOT VALID: enforced for every new or changed row without scanning old ones.
    alter table public.friendships
      add constraint friendships_not_self check (requester_id <> addressee_id) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Guard trigger
-- ---------------------------------------------------------------------------
create or replace function public._friendship_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.blocked_by := case when new.status = 'blocked' then coalesce(me, new.blocked_by) end;
    return new;
  end if;

  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
    raise exception 'A friendship''s people cannot be changed' using errcode = '42501';
  end if;

  -- blocked_by follows the status: kept while blocked, cleared otherwise, and
  -- never taken from the client.
  if old.status = 'blocked' then
    if new.status <> 'blocked' then
      if me is not null then
        raise exception 'A block is removed by deleting it' using errcode = '42501';
      end if;
      new.blocked_by := null;
    else
      new.blocked_by := old.blocked_by;
    end if;
    return new;
  end if;

  if new.status = 'blocked' then
    new.blocked_by := coalesce(me, new.blocked_by);
    return new;
  end if;

  new.blocked_by := null;
  if me is null or new.status = old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status = 'accepted' then
    if me <> old.addressee_id then
      raise exception 'Only the person asked can accept a friend request' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Friendship cannot change from % to %', old.status, new.status using errcode = '42501';
end;
$$;

drop trigger if exists trg_friendship_guard on public.friendships;
create trigger trg_friendship_guard
  before insert or update on public.friendships
  for each row execute function public._friendship_guard();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
drop policy if exists "Users can send friend requests" on public.friendships;
create policy "Users can send friend requests" on public.friendships
  for insert
  with check (
    auth.uid() = requester_id
    and requester_id <> addressee_id
    and status in ('pending', 'blocked')
  );

drop policy if exists "Users can update own friendships" on public.friendships;
create policy "Users can update own friendships" on public.friendships
  for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "Users can delete own friendships" on public.friendships;
create policy "Users can delete own friendships" on public.friendships
  for delete
  using (
    (auth.uid() = requester_id or auth.uid() = addressee_id)
    and (status <> 'blocked' or blocked_by is null or blocked_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. Confession blocks: block the pair's existing row, whichever way it runs
-- ---------------------------------------------------------------------------
create or replace function public.block_confession_author(p_confession_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_author_id uuid;
begin
  if v_uid is null then return; end if;

  select author_id into v_author_id
  from public.confessions
  where id = p_confession_id;

  if v_author_id is not null and v_author_id <> v_uid then
    update public.friendships
    set status = 'blocked'
    where least(requester_id, addressee_id) = least(v_uid, v_author_id)
      and greatest(requester_id, addressee_id) = greatest(v_uid, v_author_id);
    if not found then
      insert into public.friendships (requester_id, addressee_id, status)
      values (v_uid, v_author_id, 'blocked')
      on conflict do nothing;
    end if;
  end if;
end;
$function$;

create or replace function public.block_confession_comment_author(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_author_id uuid;
begin
  if v_uid is null then return; end if;

  select author_id into v_author_id
  from public.confession_comments
  where id = p_comment_id;

  if v_author_id is not null and v_author_id <> v_uid then
    update public.friendships
    set status = 'blocked'
    where least(requester_id, addressee_id) = least(v_uid, v_author_id)
      and greatest(requester_id, addressee_id) = greatest(v_uid, v_author_id);
    if not found then
      insert into public.friendships (requester_id, addressee_id, status)
      values (v_uid, v_author_id, 'blocked')
      on conflict do nothing;
    end if;
  end if;
end;
$function$;
