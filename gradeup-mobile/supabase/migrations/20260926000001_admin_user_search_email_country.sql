-- Admin user search: let the panel find a student by email, and filter by country.
--
-- The email lives in auth.users, which the browser client cannot read, so the
-- search runs inside a security-definer function gated on public.is_admin().
-- The function also returns the total row count so the panel can paginate
-- without a second round trip.

create or replace function public.admin_search_users(
  p_query text default null,
  p_university text default null,
  p_country text default null,
  p_plan text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort text default 'newest',
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  id uuid,
  email text,
  name text,
  student_id text,
  university_id text,
  country text,
  device_platform text,
  status text,
  subscription_plan text,
  subscription_status text,
  subscription_period_type text,
  subscription_product_id text,
  subscription_expires_at timestamptz,
  subscription_store text,
  subscription_environment text,
  subscription_price numeric,
  subscription_currency text,
  subscription_updated_at timestamptz,
  ai_token_limit_override bigint,
  created_at timestamptz,
  updated_at timestamptz,
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
  v_sort text := lower(coalesce(p_sort, 'newest'));
begin
  -- The Edge Function calls this with the service role, which has no auth.uid().
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  -- A search term is matched literally: % and _ would otherwise widen the
  -- pattern and quietly return everyone.
  if v_raw is not null then
    v_like := '%' || replace(replace(v_raw, '%', '\%'), '_', '\_') || '%';
    begin
      v_uuid := v_raw::uuid;
    exception when others then
      v_uuid := null;
    end;
  end if;

  return query
  with matched as (
    select
      p.id,
      u.email::text as email,
      p.name,
      p.student_id,
      p.university_id,
      p.country,
      p.device_platform,
      p.status,
      p.subscription_plan,
      p.subscription_status,
      p.subscription_period_type,
      p.subscription_product_id,
      p.subscription_expires_at,
      p.subscription_store,
      p.subscription_environment,
      p.subscription_price,
      p.subscription_currency,
      p.subscription_updated_at,
      p.ai_token_limit_override,
      p.created_at,
      p.updated_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (coalesce(p_university, '') = '' or p.university_id = p_university)
      and (coalesce(p_country, '') = '' or upper(coalesce(p.country, '')) = upper(p_country))
      and (coalesce(p_plan, 'all') in ('', 'all') or p.subscription_plan = p_plan)
      and (coalesce(p_status, 'all') in ('', 'all') or p.status = p_status)
      and (p_from is null or p.created_at >= p_from)
      and (p_to is null or p.created_at <= p_to)
      and (
        v_raw is null
        or (v_uuid is not null and p.id = v_uuid)
        or (
          v_uuid is null
          and (
            p.name ilike v_like
            or p.student_id ilike v_like
            or u.email ilike v_like
            or p.id::text ilike v_like
          )
        )
      )
  )
  select
    m.*,
    count(*) over ()::bigint as total_count
  from matched m
  order by
    case when v_sort = 'name_az' then lower(coalesce(m.name, '')) end asc nulls last,
    case when v_sort = 'name_za' then lower(coalesce(m.name, '')) end desc nulls last,
    case when v_sort = 'oldest' then m.created_at end asc,
    case when v_sort not in ('name_az', 'name_za', 'oldest') then m.created_at end desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.admin_search_users(
  text, text, text, text, text, timestamptz, timestamptz, text, int, int
) from public, anon;
grant execute on function public.admin_search_users(
  text, text, text, text, text, timestamptz, timestamptz, text, int, int
) to authenticated, service_role;

-- Countries that actually have users, so the panel can offer a real list
-- instead of every ISO code.
create or replace function public.admin_user_countries()
returns table(country text, user_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select upper(coalesce(nullif(btrim(p.country), ''), 'UNKNOWN')) as country,
         count(*)::bigint as user_count
  from public.profiles p
  group by 1
  order by 2 desc, 1 asc;
end;
$$;

revoke all on function public.admin_user_countries() from public, anon;
grant execute on function public.admin_user_countries() to authenticated, service_role;

-- Search hits the same columns on every keystroke, so index what it filters on.
create index if not exists profiles_country_idx on public.profiles (upper(country));
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);
