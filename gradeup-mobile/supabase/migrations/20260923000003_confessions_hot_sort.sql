-- Confessions: "Hot" feed. p_sort = 'hot' ranks the last 7 days by
-- engagement with time decay (HN-style); anything else keeps the newest-first
-- feed. Hot is a single page (no created_at cursor — score order can't page by
-- time), so the client stops paginating in that mode.
--
-- Signature gains p_sort with a default, so older app builds calling the
-- 5-argument form still resolve to this function via PostgREST.

set lock_timeout = '5s';

drop function if exists public.get_confessions(timestamptz, integer, text, text, text);

create function public.get_confessions(
  p_before timestamptz default null,
  p_limit integer default 20,
  p_campus text default null,
  p_tag text default null,
  p_search text default null,
  p_sort text default 'new'
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
  v_hot boolean := coalesce(p_sort, 'new') = 'hot';
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
    and (v_hot or p_before is null or c.created_at < p_before)
    and (not v_hot or c.created_at > now() - interval '7 days')
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
  order by
    case when v_hot then
      (c.like_count + 2 * c.comment_count + 1)::float8
        / power(extract(epoch from (now() - c.created_at)) / 3600.0 + 2, 1.5)
    end desc nulls last,
    c.created_at desc
  limit p_limit;
end;
$function$;

revoke all on function public.get_confessions(timestamptz, integer, text, text, text, text) from public, anon;
grant execute on function public.get_confessions(timestamptz, integer, text, text, text, text) to authenticated, service_role;
