-- Confessions: let the author choose to post under their name, and give every
-- confession a per-campus running number ("#Arau 1247") like the Facebook
-- confession pages students already know.
--
-- Privacy: author_name / author_avatar are returned ONLY when is_anonymous is
-- false. author_id is never returned. Default stays anonymous, and old app
-- builds (which call create_confession(p_content, p_tag)) keep posting anon.

set lock_timeout = '5s';

alter table public.confessions
  add column if not exists is_anonymous boolean not null default true,
  add column if not exists confession_no integer;

-- Backfill numbers in posting order, per university + campus. Removed/flagged
-- posts keep their number so visible numbers never shift.
with numbered as (
  select id,
         row_number() over (
           partition by university_id, coalesce(campus, '')
           order by created_at, id
         ) as n
  from public.confessions
)
update public.confessions c
   set confession_no = numbered.n
  from numbered
 where numbered.id = c.id
   and c.confession_no is null;

-- ─── Read RPCs (return type changes → drop + recreate) ─────────────────────

-- Drop both the old and the new signatures so this also runs cleanly on a
-- database where these functions were already created by hand.
drop function if exists public.get_confessions(timestamptz, integer, text, text, text);
drop function if exists public.get_confessions(timestamptz, integer, text, text, text, text);
drop function if exists public.get_confession(uuid);
drop function if exists public.create_confession(text, text);
drop function if exists public.create_confession(text, text, boolean);

create function public.get_confessions(
  p_before timestamptz default null,
  p_limit integer default 20,
  p_campus text default null,
  p_tag text default null,
  p_search text default null
)
returns table(
  id uuid, content text, campus text, tag text, created_at timestamptz,
  like_count integer, comment_count integer, my_reaction text,
  reaction_counts jsonb, is_mine boolean,
  is_anonymous boolean, confession_no integer,
  author_name text, author_avatar text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_uni text;
begin
  if v_uid is null then return; end if;
  select cp.university_id into v_uni from public._confession_caller_profile() cp;
  if v_uni is null or trim(v_uni) = '' then return; end if;

  return query
  select c.id, c.content, c.campus, c.tag, c.created_at, c.like_count, c.comment_count,
    (select cl.reaction from public.confession_likes cl where cl.confession_id = c.id and cl.user_id = v_uid limit 1) as my_reaction,
    coalesce((
      select jsonb_object_agg(reaction, count)
      from (
        select reaction, count(*) as count
        from public.confession_likes cl
        where cl.confession_id = c.id
        group by reaction
      ) agg
    ), '{}'::jsonb) as reaction_counts,
    (c.author_id = v_uid)::boolean as is_mine,
    c.is_anonymous,
    c.confession_no,
    case when c.is_anonymous then null else p.name end as author_name,
    case when c.is_anonymous then null else p.avatar_url end as author_avatar
  from public.confessions c
  left join public.profiles p on p.id = c.author_id and not c.is_anonymous
  where c.university_id = v_uni and c.status = 'active'
    and (p_before is null or c.created_at < p_before)
    and (p_campus is null or c.campus = p_campus)
    and (p_tag is null or c.tag = p_tag)
    and (p_search is null or c.content ilike '%' || p_search || '%')
    and not exists (
      select 1 from public.friendships f
      where f.status = 'blocked' and (
        (f.requester_id = v_uid and f.addressee_id = c.author_id) or
        (f.requester_id = c.author_id and f.addressee_id = v_uid)
      )
    )
  order by c.created_at desc limit p_limit;
end;
$function$;

create function public.get_confession(p_id uuid)
returns table(
  id uuid, content text, campus text, tag text, created_at timestamptz,
  like_count integer, comment_count integer, my_reaction text,
  reaction_counts jsonb, is_mine boolean,
  is_anonymous boolean, confession_no integer,
  author_name text, author_avatar text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_uni text;
begin
  if v_uid is null or p_id is null then return; end if;
  select cp.university_id into v_uni from public._confession_caller_profile() cp;
  if v_uni is null or trim(v_uni) = '' then return; end if;

  return query
  select c.id, c.content, c.campus, c.tag, c.created_at, c.like_count, c.comment_count,
    (select cl.reaction from public.confession_likes cl where cl.confession_id = c.id and cl.user_id = v_uid limit 1) as my_reaction,
    coalesce((
      select jsonb_object_agg(reaction, count)
      from (
        select reaction, count(*) as count
        from public.confession_likes cl
        where cl.confession_id = c.id
        group by reaction
      ) agg
    ), '{}'::jsonb) as reaction_counts,
    (c.author_id = v_uid)::boolean as is_mine,
    c.is_anonymous,
    c.confession_no,
    case when c.is_anonymous then null else p.name end as author_name,
    case when c.is_anonymous then null else p.avatar_url end as author_avatar
  from public.confessions c
  left join public.profiles p on p.id = c.author_id and not c.is_anonymous
  where c.id = p_id and c.university_id = v_uni and c.status = 'active';
end;
$function$;

-- ─── Create ────────────────────────────────────────────────────────────────

create function public.create_confession(
  p_content text,
  p_tag text default null,
  p_anonymous boolean default true
)
returns table(
  id uuid, content text, campus text, tag text, created_at timestamptz,
  like_count integer, comment_count integer, my_reaction text,
  reaction_counts jsonb, is_mine boolean,
  is_anonymous boolean, confession_no integer,
  author_name text, author_avatar text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_uni    text;
  v_campus text;
  v_trimmed text;
  v_plan   text;
  v_recent_30m int;
  v_recent_24h int;
  v_anon   boolean := coalesce(p_anonymous, true);
  v_no     integer;
  v_name   text;
  v_avatar text;
  v_row public.confessions%rowtype;
begin
  select out_uni, out_campus into v_uni, v_campus from public._confession_assert_can_post();
  v_trimmed := trim(coalesce(p_content, ''));
  if char_length(v_trimmed) < 1 or char_length(v_trimmed) > 500 then
    raise exception 'Confession must be between 1 and 500 characters.' using errcode = 'P0001';
  end if;

  select coalesce(p.subscription_plan, 'free'), p.name, p.avatar_url
    into v_plan, v_name, v_avatar
  from public.profiles p where p.id = v_uid;

  -- Rate limits only apply to free users
  if v_plan = 'free' then
    select count(*)::int into v_recent_30m from public.confessions cr
    where cr.author_id = v_uid and cr.created_at > now() - interval '30 minutes';
    if v_recent_30m >= 1 then
      raise exception 'Please wait 30 minutes between confessions.' using errcode = 'P0001';
    end if;

    select count(*)::int into v_recent_24h from public.confessions cr
    where cr.author_id = v_uid and cr.created_at > now() - interval '24 hours';
    if v_recent_24h >= 5 then
      raise exception 'You can post at most 5 confessions per 24 hours.' using errcode = 'P0001';
    end if;
  end if;

  -- Serialise numbering per campus so two simultaneous posts never share a number.
  perform pg_advisory_xact_lock(hashtext('confession_no:' || v_uni || ':' || coalesce(v_campus, '')));
  select coalesce(max(cn.confession_no), 0) + 1 into v_no
  from public.confessions cn
  where cn.university_id = v_uni and coalesce(cn.campus, '') = coalesce(v_campus, '');

  insert into public.confessions (author_id, university_id, campus, content, tag, is_anonymous, confession_no)
  values (v_uid, v_uni, v_campus, v_trimmed, p_tag, v_anon, v_no)
  returning * into v_row;

  return query select v_row.id, v_row.content, v_row.campus, v_row.tag, v_row.created_at,
    v_row.like_count, v_row.comment_count, null::text, '{}'::jsonb, true::boolean,
    v_row.is_anonymous, v_row.confession_no,
    case when v_anon then null else v_name end,
    case when v_anon then null else v_avatar end;
end;
$function$;

revoke all on function public.get_confessions(timestamptz, integer, text, text, text) from public, anon;
revoke all on function public.get_confession(uuid) from public, anon;
revoke all on function public.create_confession(text, text, boolean) from public, anon;
grant execute on function public.get_confessions(timestamptz, integer, text, text, text) to authenticated, service_role;
grant execute on function public.get_confession(uuid) to authenticated, service_role;
grant execute on function public.create_confession(text, text, boolean) to authenticated, service_role;
