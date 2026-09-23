-- =============================================================================
-- Confessions: stop contact details leaking, and give moderation a home.
--
-- Three things, all of them consequences of one gap: confessions is the only
-- user-visible surface in the app with no moderation tooling behind it. Its
-- content check was fifteen keywords hard-coded inside a trigger, so every
-- change needed a migration, and nothing at all stopped a phone number, an
-- email or a WhatsApp link — on a wall that is anonymous by default, which is
-- exactly where posting someone's number does the most damage.
--
--   1. public.confession_blocked_words — the keyword list becomes data, seeded
--      with the fifteen that were in the trigger so behaviour is unchanged on
--      day one, and editable by admins from then on.
--   2. check_confession_content() reads that table and additionally rejects
--      phone numbers, emails and links. It covers confessions AND comments,
--      on INSERT and on UPDATE, so an edit cannot smuggle content past it.
--   3. admin_* RPCs to browse confessions per campus, and to remove one that
--      passes the filter but should not stand.
--
-- ACCESS MODEL, and why it is shaped this way: confession_blocked_words has
-- RLS on and NO policies. Nothing reaches it except the SECURITY DEFINER
-- functions below, each of which calls is_admin() once, at the top. No policy
-- here calls is_admin(), because a permissive policy that does is evaluated
-- once per row — that is what read 24 million admin_users rows in 18 minutes
-- on 2026-09-23. See 20260923000001_profiles_rls_hot_path.sql.
-- =============================================================================

-- ─── 1. The word list ───────────────────────────────────────────────────────

create table if not exists public.confession_blocked_words (
  id         uuid primary key default gen_random_uuid(),
  -- Stored lowercase and matched as a substring, the same way the trigger's
  -- hard-coded array behaved.
  pattern    text not null unique check (char_length(trim(pattern)) between 2 and 100),
  note       text,
  active     boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists confession_blocked_words_active_idx
  on public.confession_blocked_words (active) where active;

alter table public.confession_blocked_words enable row level security;
revoke all on public.confession_blocked_words from authenticated, anon;

-- The fifteen that were compiled into the trigger. ON CONFLICT so re-running
-- this migration never disturbs a list an admin has since edited.
insert into public.confession_blocked_words (pattern, note) values
  ('onlyfans',       'Adult content'),
  ('only fans',      'Adult content'),
  ('escort',         'Adult services'),
  ('prostitut',      'Adult services'),
  ('hookup',         'Adult services'),
  ('sugar daddy',    'Adult services'),
  ('sugar baby',     'Adult services'),
  ('porn',           'Adult content'),
  ('xxx',            'Adult content'),
  ('nude',           'Adult content'),
  ('nudes',          'Adult content'),
  ('cocaine',        'Drugs'),
  ('meth',           'Drugs'),
  ('syabu',          'Drugs'),
  ('dadah',          'Drugs'),
  ('write my exam',  'Academic dishonesty'),
  ('take my exam',   'Academic dishonesty'),
  ('fake degree',    'Academic dishonesty')
on conflict (pattern) do nothing;

-- ─── 2. The content check ───────────────────────────────────────────────────

/**
 * Rejects a confession or comment that carries banned words or contact details.
 *
 * SECURITY DEFINER on purpose: it reads confession_blocked_words, which has RLS
 * on and no policies. As INVOKER the SELECT would quietly return zero rows and
 * the filter would pass everything.
 *
 * Phone numbers are matched against the content stripped to digits, so
 * "0 1 2 - 3 4 5 6 7 8 9" is caught the same as "0123456789". The pattern
 * deliberately requires a Malaysian mobile prefix (01… or 601…) followed by
 * 8-9 digits rather than "any long run of digits": a UiTM matric is ten digits
 * and would be caught by the looser rule. Landlines are left alone for the
 * same reason — 0[3-9] plus seven digits collides with matric numbers.
 */
create or replace function public.check_confession_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text   text;
  v_digits text;
  v_word   text;
begin
  v_text := lower(trim(coalesce(new.content, '')));

  -- Admin-managed keywords.
  for v_word in
    select w.pattern from public.confession_blocked_words w where w.active
  loop
    if position(v_word in v_text) > 0 then
      raise exception 'This content violates our community guidelines.'
        using errcode = 'P0001';
    end if;
  end loop;

  -- Links, including the ones people reach for when sharing a number.
  if v_text ~ '(https?://|www\.)'
     or v_text ~ '(wa\.me|whatsapp\.com|chat\.whatsapp|t\.me|telegram\.me|telegram\.dog|bit\.ly|linktr\.ee)'
  then
    raise exception 'Links are not allowed in confessions. Remove the link and try again.'
      using errcode = 'P0001';
  end if;

  -- Email addresses.
  if v_text ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then
    raise exception 'Do not post email addresses here. Remove it and try again.'
      using errcode = 'P0001';
  end if;

  -- Phone numbers, separators and spacing ignored.
  v_digits := regexp_replace(v_text, '[^0-9]', '', 'g');
  if v_digits ~ '(601|01)[0-9]{8,9}' then
    raise exception 'Do not post phone numbers here. Remove it and try again.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_confession_content on public.confessions;
create trigger trg_check_confession_content
  before insert or update of content on public.confessions
  for each row execute function public.check_confession_content();

drop trigger if exists trg_check_confession_comment_content on public.confession_comments;
create trigger trg_check_confession_comment_content
  before insert or update of content on public.confession_comments
  for each row execute function public.check_confession_content();

-- ─── 3. Removal bookkeeping ─────────────────────────────────────────────────
-- Removal is a status change, not a DELETE: create_confession numbers posts
-- with max(confession_no) + 1 per campus, so deleting the newest row would
-- hand its number to the next one and two posts would have shared "#Arau 12".

alter table public.confessions
  add column if not exists removed_at     timestamptz,
  add column if not exists removed_by     uuid references auth.users(id) on delete set null,
  add column if not exists removed_reason text;

-- ─── 4. Admin RPCs ──────────────────────────────────────────────────────────
-- Each one authorises with a single is_admin() call, not with a policy.

create or replace function public.admin_list_confession_blocked_words()
returns table(id uuid, pattern text, note text, active boolean, created_at timestamptz)
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select w.id, w.pattern, w.note, w.active, w.created_at
    from public.confession_blocked_words w
    order by w.active desc, w.pattern;
end;
$$;

create or replace function public.admin_add_confession_blocked_word(
  p_pattern text,
  p_note text default null
)
returns table(id uuid, pattern text, note text, active boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pattern text := lower(trim(coalesce(p_pattern, '')));
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if char_length(v_pattern) < 2 then
    raise exception 'A blocked word needs at least two characters.' using errcode = 'P0001';
  end if;

  return query
    with up as (
      insert into public.confession_blocked_words (pattern, note, created_by)
      values (v_pattern, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
      on conflict (pattern) do update
        set active = true,
            note = coalesce(excluded.note, confession_blocked_words.note)
      returning *
    )
    select up.id, up.pattern, up.note, up.active, up.created_at from up;
end;
$$;

create or replace function public.admin_set_confession_blocked_word_active(
  p_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  update public.confession_blocked_words
     set active = coalesce(p_active, true)
   where id = p_id;
end;
$$;

create or replace function public.admin_delete_confession_blocked_word(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  delete from public.confession_blocked_words where id = p_id;
end;
$$;

/**
 * Counts per university and campus, so the admin screen can show folders and
 * load nothing else until one is opened. Grouped, so it stays a handful of
 * rows however many confessions exist.
 */
create or replace function public.admin_confession_campus_summary()
returns table(
  university_id text,
  campus text,
  total bigint,
  active_count bigint,
  flagged_count bigint,
  removed_count bigint,
  reported_count bigint,
  last_at timestamptz
)
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select c.university_id,
           c.campus,
           count(*)::bigint,
           (count(*) filter (where c.status = 'active'))::bigint,
           (count(*) filter (where c.status = 'flagged'))::bigint,
           (count(*) filter (where c.status = 'removed'))::bigint,
           (count(*) filter (where exists (
             select 1 from public.confession_reports r where r.confession_id = c.id
           )))::bigint,
           max(c.created_at)
    from public.confessions c
    group by c.university_id, c.campus
    order by count(*) desc;
end;
$$;

/**
 * One page of confessions for one campus. Never returns the whole wall: the
 * limit is capped server-side so a client cannot ask for everything, and
 * total_count rides along so the page can show "showing 25 of 4,102" without
 * a second round trip.
 *
 * Author identity is deliberately absent. Removing a post does not require
 * knowing who wrote it, and this wall is anonymous by default.
 */
create or replace function public.admin_list_confessions(
  p_university text default null,
  p_campus text default null,
  p_status text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table(
  id uuid,
  confession_no integer,
  content text,
  campus text,
  university_id text,
  tag text,
  status text,
  is_anonymous boolean,
  like_count integer,
  comment_count integer,
  report_count bigint,
  created_at timestamptz,
  removed_at timestamptz,
  removed_reason text,
  total_count bigint
)
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
    select c.id,
           c.confession_no,
           c.content,
           c.campus,
           c.university_id,
           c.tag,
           c.status,
           c.is_anonymous,
           c.like_count,
           c.comment_count,
           (select count(*) from public.confession_reports r where r.confession_id = c.id)::bigint,
           c.created_at,
           c.removed_at,
           c.removed_reason,
           (count(*) over ())::bigint
    from public.confessions c
    where (p_university is null or c.university_id = p_university)
      -- '' asks for the rows with no campus; null asks for every campus.
      and (p_campus is null or coalesce(c.campus, '') = p_campus)
      and (p_status is null or c.status = p_status)
      and (p_search is null or c.content ilike '%' || p_search || '%')
    order by c.created_at desc
    limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_set_confession_status(
  p_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'flagged', 'removed') then
    raise exception 'Unknown status %.', p_status using errcode = 'P0001';
  end if;

  update public.confessions
     set status = p_status,
         removed_at = case when p_status = 'removed' then now() else null end,
         removed_by = case when p_status = 'removed' then auth.uid() else null end,
         removed_reason = case
           when p_status = 'removed' then nullif(trim(coalesce(p_reason, '')), '')
           else null
         end
   where id = p_id;
end;
$$;

revoke all on function public.admin_list_confession_blocked_words() from public, anon;
revoke all on function public.admin_add_confession_blocked_word(text, text) from public, anon;
revoke all on function public.admin_set_confession_blocked_word_active(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_confession_blocked_word(uuid) from public, anon;
revoke all on function public.admin_confession_campus_summary() from public, anon;
revoke all on function public.admin_list_confessions(text, text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_set_confession_status(uuid, text, text) from public, anon;

grant execute on function public.admin_list_confession_blocked_words() to authenticated;
grant execute on function public.admin_add_confession_blocked_word(text, text) to authenticated;
grant execute on function public.admin_set_confession_blocked_word_active(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_confession_blocked_word(uuid) to authenticated;
grant execute on function public.admin_confession_campus_summary() to authenticated;
grant execute on function public.admin_list_confessions(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_set_confession_status(uuid, text, text) to authenticated;
