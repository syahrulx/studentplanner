-- =============================================================================
-- Confessions: catch the words people disguise, and give admins the thread.
--
-- The filter added in 20260923000008 matches a blocked word as plain text, so
-- "porn" is refused and "pxrn", "p0rn", "p o r n" and "poooorn" all sail past.
-- Tightening the hard block to cover those would start refusing innocent posts,
-- so this does the other thing: it records what a post LOOKS like it was trying
-- to say, leaves the post up, and shows an admin the suspicion.
--
--   suspect_terms — the blocked words a post resembles. Set on insert, never
--   blocks anything. status stays 'active', so nothing disappears from the
--   student feed until a human decides it should.
--
-- Plus the queries the admin screen needs to walk university → campus → post →
-- replies, instead of one flat list of everything ever written.
-- =============================================================================

-- ─── Normalisation ──────────────────────────────────────────────────────────

/**
 * Fold the tricks people use to get a word past a plain-text filter: digits and
 * symbols that stand in for letters, padding between the letters, and repeated
 * letters. "P-0-R-N", "p o r n" and "poooorn" all normalise to "porn".
 */
create or replace function public.confession_normalise_text(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             translate(lower(coalesce(p_text, '')), '01345789@$!', 'oieastbgasi'),
             '[^a-z]', '', 'g'
           ),
           '(.)\1+', '\1', 'g'
         );
$$;

/**
 * True when a word in a post is a blocked word with one character masked.
 *
 * Deliberately narrow. "One edit from a blocked word" sounds like the right
 * test until you run it: born, corn, horn, torn, worn, pork and port are all
 * one edit from porn, and a queue full of those is a queue nobody reads. What
 * actually distinguishes evasion is WHAT the character was replaced with —
 * people mask with a symbol, a digit or an x, not by swapping in another
 * ordinary letter. So: same length, exactly one position different, and that
 * position holds something that is not a plain letter, or holds an x.
 *
 * Digits and symbols that stand in for a letter ("p0rn") never reach here;
 * confession_normalise_text folds those and the containment pass catches them.
 */
create or replace function public.confession_masked_match(p_token text, p_word text)
returns boolean
language plpgsql
immutable
as $$
declare
  n int := length(coalesce(p_token, ''));
  i int;
  diff_at int := 0;
  ch text;
begin
  if n < 4 or n <> length(coalesce(p_word, '')) then
    return false;
  end if;

  for i in 1..n loop
    if substr(p_token, i, 1) <> substr(p_word, i, 1) then
      if diff_at > 0 then return false; end if;
      diff_at := i;
    end if;
  end loop;

  if diff_at = 0 then
    return false;  -- identical; the hard filter already refused it
  end if;

  ch := substr(p_token, diff_at, 1);
  return ch !~ '[a-z]' or ch = 'x';
end;
$$;

/**
 * Blocked words a post resembles without containing outright.
 *
 * Two passes, both against the ACTIVE list, so a word an admin disables stops
 * flagging as well as stops blocking:
 *
 *   1. the whole post, normalised, contains the normalised word — this is
 *      "p0rn" and "p o r n";
 *   2. a single word in the post is a blocked word with one character masked
 *      — this is "pxrn" and "p*rn". See confession_masked_match for why it is
 *      not simply "one edit away".
 *
 * A post that contains the word plainly never reaches here — the trigger
 * refuses it first — so anything this returns is an attempt to get around the
 * filter, or a coincidence for an admin to dismiss.
 */
create or replace function public.confession_suspect_terms(p_text text)
returns text[]
language plpgsql
stable
as $$
declare
  v_flat   text := public.confession_normalise_text(p_text);
  v_tokens text[];
  v_token  text;
  v_word   record;
  v_norm   text;
  v_hits   text[] := '{}';
begin
  if v_flat = '' then return v_hits; end if;

  -- Tokens keep their symbols: the mask is the evidence.
  v_tokens := regexp_split_to_array(trim(lower(coalesce(p_text, ''))), '\s+');

  for v_word in
    select w.pattern from public.confession_blocked_words w where w.active
  loop
    v_norm := public.confession_normalise_text(v_word.pattern);
    if v_norm = '' or v_norm = any (v_hits) then
      continue;
    end if;

    if position(v_norm in v_flat) > 0 then
      v_hits := v_hits || v_word.pattern;
      continue;
    end if;

    foreach v_token in array v_tokens loop
      -- Punctuation around a word is punctuation; inside it, it is the mask.
      v_token := regexp_replace(v_token, '^[[:punct:]]+|[[:punct:]]+$', '', 'g');
      if public.confession_masked_match(v_token, lower(v_word.pattern)) then
        v_hits := v_hits || v_word.pattern;
        exit;
      end if;
    end loop;
  end loop;

  return v_hits;
end;
$$;

-- ─── Storage ────────────────────────────────────────────────────────────────

alter table public.confessions
  add column if not exists suspect_terms text[];

alter table public.confession_comments
  add column if not exists suspect_terms text[];

-- Partial: the admin screen only ever asks for the flagged ones, and they are
-- a tiny fraction of the table.
create index if not exists confessions_suspect_idx
  on public.confessions (university_id, campus, created_at desc)
  where suspect_terms is not null and cardinality(suspect_terms) > 0;

-- ─── The trigger, now also flagging ─────────────────────────────────────────

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

  -- Admin-managed keywords, matched as plain text.
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

  -- Past the hard rules: record what it resembles, and let it through. An
  -- auto-removal here would be a filter nobody can see failing.
  new.suspect_terms := nullif(public.confession_suspect_terms(new.content), '{}');

  return new;
end;
$$;

-- Existing rows predate the flagging; score them once so the admin screen is
-- useful on the day it ships.
update public.confessions c
   set suspect_terms = nullif(public.confession_suspect_terms(c.content), '{}')
 where c.suspect_terms is null;

update public.confession_comments cc
   set suspect_terms = nullif(public.confession_suspect_terms(cc.content), '{}')
 where cc.suspect_terms is null;

-- ─── Admin reads: university → campus → post → replies ──────────────────────

create or replace function public.admin_confession_universities()
returns table(
  university_id text,
  campus_count bigint,
  total bigint,
  active_count bigint,
  removed_count bigint,
  suspect_count bigint,
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
           count(distinct coalesce(c.campus, ''))::bigint,
           count(*)::bigint,
           (count(*) filter (where c.status = 'active'))::bigint,
           (count(*) filter (where c.status = 'removed'))::bigint,
           (count(*) filter (where cardinality(coalesce(c.suspect_terms, '{}')) > 0
                               and c.status <> 'removed'))::bigint,
           (count(*) filter (where exists (
             select 1 from public.confession_reports r where r.confession_id = c.id
           )))::bigint,
           max(c.created_at)
    from public.confessions c
    group by c.university_id
    order by count(*) desc;
end;
$$;

drop function if exists public.admin_confession_campus_summary();

create function public.admin_confession_campus_summary(p_university text default null)
returns table(
  university_id text,
  campus text,
  total bigint,
  active_count bigint,
  flagged_count bigint,
  removed_count bigint,
  suspect_count bigint,
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
           (count(*) filter (where cardinality(coalesce(c.suspect_terms, '{}')) > 0
                               and c.status <> 'removed'))::bigint,
           (count(*) filter (where exists (
             select 1 from public.confession_reports r where r.confession_id = c.id
           )))::bigint,
           max(c.created_at)
    from public.confessions c
    where p_university is null or c.university_id = p_university
    group by c.university_id, c.campus
    order by count(*) desc;
end;
$$;

drop function if exists public.admin_list_confessions(text, text, text, text, integer, integer);

create function public.admin_list_confessions(
  p_university text default null,
  p_campus text default null,
  p_status text default null,
  p_search text default null,
  p_suspect_only boolean default false,
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
  suspect_terms text[],
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
           coalesce(c.suspect_terms, '{}'),
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
      and (not coalesce(p_suspect_only, false)
           or cardinality(coalesce(c.suspect_terms, '{}')) > 0)
    order by c.created_at desc
    limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

/** Replies under one confession. Loaded only when a post is opened. */
create or replace function public.admin_list_confession_comments(p_confession_id uuid)
returns table(
  id uuid,
  content text,
  status text,
  suspect_terms text[],
  created_at timestamptz
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
    select cc.id, cc.content, cc.status, coalesce(cc.suspect_terms, '{}'), cc.created_at
    from public.confession_comments cc
    where cc.confession_id = p_confession_id
    order by cc.created_at;
end;
$$;

create or replace function public.admin_set_confession_comment_status(
  p_id uuid,
  p_status text
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
  update public.confession_comments set status = p_status where id = p_id;
end;
$$;

/**
 * Re-score every post against the current word list.
 *
 * Adding a word only flags posts written after it, which would leave the list
 * of what to review depending on the order the admin happened to add things.
 * Called from the admin screen after a word is added.
 */
create or replace function public.admin_rescore_confession_suspects()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  update public.confessions c
     set suspect_terms = nullif(public.confession_suspect_terms(c.content), '{}');
  get diagnostics v_count = row_count;

  update public.confession_comments cc
     set suspect_terms = nullif(public.confession_suspect_terms(cc.content), '{}');

  return v_count;
end;
$$;

revoke all on function public.admin_confession_universities() from public, anon;
revoke all on function public.admin_confession_campus_summary(text) from public, anon;
revoke all on function public.admin_list_confessions(text, text, text, text, boolean, integer, integer) from public, anon;
revoke all on function public.admin_list_confession_comments(uuid) from public, anon;
revoke all on function public.admin_set_confession_comment_status(uuid, text) from public, anon;
revoke all on function public.admin_rescore_confession_suspects() from public, anon;

grant execute on function public.admin_confession_universities() to authenticated;
grant execute on function public.admin_confession_campus_summary(text) to authenticated;
grant execute on function public.admin_list_confessions(text, text, text, text, boolean, integer, integer) to authenticated;
grant execute on function public.admin_list_confession_comments(uuid) to authenticated;
grant execute on function public.admin_set_confession_comment_status(uuid, text) to authenticated;
grant execute on function public.admin_rescore_confession_suspects() to authenticated;
