-- Repair admin_list_confession_comments, which 20261008000002 broke.
--
-- That migration selected cc.alias. There is no such column: the alias is
-- COMPUTED by get_confession_comments from the order in which people first
-- commented, and it is never stored. The function was created anyway — this
-- database does not validate plpgsql bodies at creation — and then raised
-- "column cc.alias does not exist" on every call, so an admin opening a post
-- with nineteen replies was told there were none.
--
-- The alias is now derived here the same way the app derives it: the
-- confession's author is OP, and everyone else is numbered by when they first
-- commented.
--
-- The numbering runs over ACTIVE comments only, deliberately. That is the set
-- a student sees, so it is the set their numbering comes from, and a report
-- naming someone has to point at the same person here. A comment whose author
-- has nothing active left returns a null alias rather than a number that would
-- disagree with what anybody was looking at.
--
-- Admins still receive every comment, including removed ones. Only the
-- numbering is restricted, not the rows.

drop function if exists public.admin_list_confession_comments(uuid);

create function public.admin_list_confession_comments(p_confession_id uuid)
returns table(
  id uuid,
  content text,
  status text,
  suspect_terms text[],
  created_at timestamptz,
  alias text
)
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select c.author_id into v_author from public.confessions c where c.id = p_confession_id;

  return query
  with ordered as (
    select
      cc.id, cc.content, cc.status, coalesce(cc.suspect_terms, '{}'::text[]) as suspect_terms,
      cc.created_at, cc.author_id,
      (cc.author_id = v_author) as is_op,
      row_number() over (order by cc.created_at asc) as seq
    from public.confession_comments cc
    where cc.confession_id = p_confession_id
  ),
  anon_map as (
    select o.author_id, dense_rank() over (order by min(o.seq))::int as anon_num
    from ordered o
    where not o.is_op and o.status = 'active'
    group by o.author_id
  )
  select
    o.id, o.content, o.status, o.suspect_terms, o.created_at,
    case
      when o.is_op then 'OP'
      when am.anon_num is null then null
      else 'Anon ' || am.anon_num::text
    end as alias
  from ordered o
  left join anon_map am on am.author_id = o.author_id and not o.is_op
  order by o.created_at asc;
end;
$$;

revoke all on function public.admin_list_confession_comments(uuid) from public, anon;
grant execute on function public.admin_list_confession_comments(uuid) to authenticated;
