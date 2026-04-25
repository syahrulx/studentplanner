-- Monthly AI token usage (calendar month, UTC) for per-plan quota enforcement.
--
-- Free / Plus / Pro limits are enforced inside the Edge Functions (see
-- supabase/functions/_shared/tokenLimit.ts). This SQL function gives the Edge
-- layer a single cheap query to sum the user's usage for the current month.

create index if not exists ai_token_usage_user_month_idx
  on public.ai_token_usage (user_id, created_at desc);

create or replace function public.get_user_monthly_ai_tokens(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(total_tokens), 0)::bigint
  from public.ai_token_usage
  where user_id = p_user_id
    and created_at >= date_trunc('month', timezone('utc', now()));
$$;

grant execute on function public.get_user_monthly_ai_tokens(uuid) to authenticated, service_role;

-- Optional: keep this function invokable by users so the mobile app could read
-- their own current-month usage in the future (e.g. to show a usage meter).
-- SECURITY DEFINER + the where-clause on user_id makes it safe for other rows.
