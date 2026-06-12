-- Admin dashboard: SECURITY DEFINER RPC for the AI token usage chart.
--
-- The dashboard previously queried `ai_token_usage` directly through the
-- anon/user Supabase client. That works as long as the `ai_usage_select_admin`
-- RLS policy fires correctly for every session, but there is a subtle failure
-- mode: if the policy is missing or the admin row check returns false (e.g.
-- after a session refresh), the query silently returns 0 rows.
--
-- Using a SECURITY DEFINER function is the same pattern as every other admin
-- dashboard query (`admin_dashboard_overview`, `admin_course_usage_top`,
-- `get_user_monthly_ai_tokens`). It runs as the function owner (postgres) and
-- bypasses RLS entirely, so the chart always sees ALL rows regardless of the
-- caller's JWT state.
--
-- Only callers who are admins (public.is_admin()) can execute the function.

create or replace function public.admin_ai_token_usage_last14days()
returns table (
  day       date,
  tokens    bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  return query
  select
    (created_at at time zone 'utc')::date as day,
    coalesce(sum(total_tokens), 0)::bigint  as tokens
  from public.ai_token_usage
  where created_at >= (timezone('utc', now()) - interval '13 days')::date
  group by 1
  order by 1;
end;
$$;

grant execute on function public.admin_ai_token_usage_last14days()
  to authenticated, service_role;
