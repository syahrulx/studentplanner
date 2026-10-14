-- Give the admin confession view the same aliases students see.
--
-- Moderation reads a thread to judge it, and a thread of "Anon 1 … Anon 3"
-- does not read like the conversation a student reported. The alias is already
-- on the row; it simply was not returned.
--
-- The alias reveals nothing a number did not: it is a per-thread label the app
-- turns into a nickname, seeded by the confession id, and it does not follow
-- anyone between confessions.
--
-- The return type gains a column, so the function has to be dropped rather
-- than replaced — Postgres will not change OUT parameters in place.

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
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select cc.id, cc.content, cc.status, coalesce(cc.suspect_terms, '{}'), cc.created_at, cc.alias
    from public.confession_comments cc
    where cc.confession_id = p_confession_id
    order by cc.created_at;
end;
$$;

revoke all on function public.admin_list_confession_comments(uuid) from public, anon;
grant execute on function public.admin_list_confession_comments(uuid) to authenticated;
