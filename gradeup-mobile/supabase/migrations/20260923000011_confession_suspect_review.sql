-- =============================================================================
-- Two fixes to the confession review queue.
--
-- 1. Adding a word failed with 'UPDATE requires a WHERE clause'.
--    admin_rescore_confession_suspects re-scored by updating every row —
--    literally `update public.confessions set suspect_terms = …` with no
--    predicate — and Supabase runs pg_safeupdate, which refuses exactly that.
--    It was also wasteful: every row was rewritten whether or not its score
--    changed. Now only the rows whose score actually moves are written, which
--    is both a real WHERE clause and far less work.
--
-- 2. A flagged post had no way out of the queue. The flag is a suspicion, and
--    most suspicions are wrong — a post reading "corn" beside an unrelated
--    word, a coincidence in Malay — so an admin needs to be able to say "this
--    is fine" and have it stop asking. suspect_reviewed_at records that.
--
--    The evidence stays: suspect_terms is not cleared, so the chips still show
--    what was matched and the decision can be revisited. Only the queue drops
--    it. And if a later word list produces a DIFFERENT finding for that post,
--    the review resets — the admin cleared the old suspicion, not every future
--    one.
-- =============================================================================

alter table public.confessions
  add column if not exists suspect_reviewed_at timestamptz,
  add column if not exists suspect_reviewed_by uuid references auth.users(id) on delete set null;

-- "Needs review" is the only thing the admin screen counts or filters by, so
-- that is what the index covers.
drop index if exists public.confessions_suspect_idx;
create index if not exists confessions_needs_review_idx
  on public.confessions (university_id, campus, created_at desc)
  where suspect_terms is not null
    and cardinality(suspect_terms) > 0
    and suspect_reviewed_at is null;

create or replace function public.admin_mark_confession_suspect_reviewed(
  p_id uuid,
  p_reviewed boolean default true
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

  update public.confessions c
     set suspect_reviewed_at = case when coalesce(p_reviewed, true) then now() else null end,
         suspect_reviewed_by = case when coalesce(p_reviewed, true) then auth.uid() else null end
   where c.id = p_id;
end;
$$;

/**
 * Re-score every post against the current word list.
 *
 * The WHERE is not decoration: pg_safeupdate refuses an unqualified UPDATE, and
 * without it this rewrote the whole table to change a handful of rows. Scoring
 * each row in a subquery lets the predicate compare old against new, so only
 * genuine changes are written — and a row whose finding changed is put back in
 * the queue, because what the admin cleared was the old suspicion.
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
     set suspect_terms = scored.new_terms,
         suspect_reviewed_at = null,
         suspect_reviewed_by = null
    from (
      select x.id, nullif(public.confession_suspect_terms(x.content), '{}') as new_terms
      from public.confessions x
    ) scored
   where scored.id = c.id
     and scored.new_terms is distinct from c.suspect_terms;
  get diagnostics v_count = row_count;

  update public.confession_comments cc
     set suspect_terms = scored.new_terms
    from (
      select x.id, nullif(public.confession_suspect_terms(x.content), '{}') as new_terms
      from public.confession_comments x
    ) scored
   where scored.id = cc.id
     and scored.new_terms is distinct from cc.suspect_terms;

  return v_count;
end;
$$;

-- ─── Counts and filters now mean "needs review", not "was ever flagged" ─────

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
                               and c.suspect_reviewed_at is null
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

create or replace function public.admin_confession_campus_summary(p_university text default null)
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
                               and c.suspect_reviewed_at is null
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

drop function if exists public.admin_list_confessions(text, text, text, text, boolean, integer, integer);

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
  suspect_reviewed_at timestamptz,
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
           c.suspect_reviewed_at,
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
      -- "Needs review" is flagged AND not yet cleared.
      and (not coalesce(p_suspect_only, false)
           or (cardinality(coalesce(c.suspect_terms, '{}')) > 0
               and c.suspect_reviewed_at is null))
    order by c.created_at desc
    limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_mark_confession_suspect_reviewed(uuid, boolean) from public, anon;
revoke all on function public.admin_list_confessions(text, text, text, text, boolean, integer, integer) from public, anon;

grant execute on function public.admin_mark_confession_suspect_reviewed(uuid, boolean) to authenticated;
grant execute on function public.admin_list_confessions(text, text, text, text, boolean, integer, integer) to authenticated;
