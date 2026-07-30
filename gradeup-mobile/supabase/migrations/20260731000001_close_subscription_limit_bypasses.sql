-- =============================================================================
-- Close several ways a client could bypass free-tier limits by writing
-- straight to the DB instead of going through the (correctly plan-checked)
-- Edge Functions. All limits below are enforced with the same numbers the
-- app already shows in the UI (see src/lib/flashcardGenerationLimits.ts and
-- app/subject-chat.tsx) — this just makes them authoritative server-side too.
-- =============================================================================

-- ── 1. ai_token_usage: any authenticated user could previously insert a row
-- with e.g. total_tokens = -999999 directly (the only INSERT policy just
-- checked auth.uid() = user_id), permanently driving their own monthly usage
-- sum negative and defeating every AI token limit in the app forever. Only
-- the service-role Edge Functions (logTokenUsage in _shared/tokenLimit.ts)
-- ever need to write here, so drop the client insert policy entirely, and
-- add a non-negative CHECK as defense-in-depth in case anything else writes
-- here in the future.

-- Forgive/clean up any rows already exploiting this (their usage sum simply
-- goes back to whatever legitimate positive usage remains) so the CHECK
-- constraint below can be added without failing on existing bad data.
delete from public.ai_token_usage
where coalesce(prompt_tokens, 0) < 0
   or coalesce(completion_tokens, 0) < 0
   or coalesce(total_tokens, 0) < 0;

drop policy if exists "ai_usage_insert_own" on public.ai_token_usage;

alter table public.ai_token_usage
  add constraint ai_token_usage_non_negative
  check (
    coalesce(prompt_tokens, 0) >= 0
    and coalesce(completion_tokens, 0) >= 0
    and coalesce(total_tokens, 0) >= 0
  );

-- ── 2. study_snaps: the daily post cap (free=1, plus=3, pro=unlimited) was
-- only checked client-side before postSnap()'s insert. Enforce it server-side
-- too. auth.uid() is null whenever the write comes from the service role
-- (no Edge Function currently writes here, but this keeps the same "trusted
-- service role / untrusted client" convention as the rest of the schema, see
-- profiles_lock_subscription_plan_non_admin in 037_subscription_plan_lock_admin_only.sql).
create or replace function public.study_snaps_enforce_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max int;
  v_count int;
begin
  if auth.uid() is null then
    return new;
  end if;

  select subscription_plan into v_plan from public.profiles where id = new.user_id;

  if v_plan = 'pro' then
    return new; -- unlimited
  end if;

  v_max := case when v_plan = 'plus' then 3 else 1 end;

  select count(*) into v_count
  from public.study_snaps
  where user_id = new.user_id
    and created_at >= date_trunc('day', now());

  if v_count >= v_max then
    raise exception 'Daily snap limit reached for your plan';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_study_snaps_daily_limit on public.study_snaps;
create trigger trg_study_snaps_daily_limit
before insert on public.study_snaps
for each row execute function public.study_snaps_enforce_daily_limit();

-- ── 3. snap_streaks: reviveStreak() takes the plan as a parameter supplied
-- by the calling client and the only RLS rule is ownership, so a client
-- could self-upsert any revivals_used/current_streak/longest_streak value —
-- bypassing the monthly revival cap (free=1, plus=2, pro=3) and fabricating
-- a streak. Enforce two things server-side, matching invariants that hold
-- for every legitimate code path in snapApi.ts (updateStreakOnPost /
-- reviveStreak):
--   a) current_streak can only ever advance by +1 per write (or reset down);
--      longest_streak is monotonic and never below current_streak.
--   b) revivals_used can only advance (or reset to 0 on a genuine month
--      rollover) up to the caller's plan cap, and revival_month can only ever
--      be the real current month — not an arbitrary value used to spoof a
--      "new month" reset.
create or replace function public.snap_streaks_enforce_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max_revivals int;
  v_now_month int;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.longest_streak < new.current_streak then
    raise exception 'longest_streak cannot be less than current_streak';
  end if;

  if tg_op = 'INSERT' then
    if new.current_streak > 1 or new.longest_streak > 1 or new.revivals_used > 0 then
      raise exception 'Invalid initial streak values';
    end if;
  else
    if new.current_streak > old.current_streak + 1 then
      raise exception 'Invalid current_streak transition';
    end if;
    if new.longest_streak < old.longest_streak then
      raise exception 'longest_streak cannot decrease';
    end if;
  end if;

  v_now_month := extract(year from now())::int * 100 + extract(month from now())::int;

  if new.revival_month <> 0 and new.revival_month <> v_now_month then
    raise exception 'Invalid revival_month';
  end if;

  if tg_op = 'UPDATE' and new.revival_month = old.revival_month and new.revivals_used < old.revivals_used then
    raise exception 'revivals_used cannot decrease within the same month';
  end if;

  if new.revivals_used > 0 and new.revival_month = v_now_month then
    select subscription_plan into v_plan from public.profiles where id = new.user_id;
    v_max_revivals := case when v_plan = 'pro' then 3 when v_plan = 'plus' then 2 else 1 end;
    if new.revivals_used > v_max_revivals then
      raise exception 'Monthly streak revival limit reached for your plan';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_snap_streaks_enforce_limits on public.snap_streaks;
create trigger trg_snap_streaks_enforce_limits
before insert or update on public.snap_streaks
for each row execute function public.snap_streaks_enforce_limits();

-- ── 4. ai_chat_sessions: the per-subject saved-conversation cap (free=1,
-- plus=3, pro=15, see app/subject-chat.tsx) was only checked client-side
-- before createChatSession()'s insert. Enforce it server-side too.
create or replace function public.ai_chat_sessions_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max int;
  v_count int;
begin
  if auth.uid() is null then
    return new;
  end if;

  select subscription_plan into v_plan from public.profiles where id = new.user_id;
  v_max := case when v_plan = 'pro' then 15 when v_plan = 'plus' then 3 else 1 end;

  select count(*) into v_count
  from public.ai_chat_sessions
  where user_id = new.user_id and subject_id = new.subject_id;

  if v_count >= v_max then
    raise exception 'Saved conversation limit reached for this subject on your plan';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ai_chat_sessions_enforce_limit on public.ai_chat_sessions;
create trigger trg_ai_chat_sessions_enforce_limit
before insert on public.ai_chat_sessions
for each row execute function public.ai_chat_sessions_enforce_limit();
