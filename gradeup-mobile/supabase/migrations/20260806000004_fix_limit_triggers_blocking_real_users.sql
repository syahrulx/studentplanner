-- CORRECTIVE MIGRATION for 20260731000001_close_subscription_limit_bypasses.sql.
--
-- That migration's triggers were too strict and reject writes made by ordinary,
-- legitimate app usage. All three failures are silent (the client only
-- console.warn's), so users just see a feature quietly stop working:
--
--   1. snap_streaks: updateStreakOnPost() (src/lib/snapApi.ts) carries the
--      STORED revivals_used/revival_month through unchanged on every ordinary
--      snap post. The old trigger raised whenever revival_month wasn't the
--      current month, so any user who ever revived a streak had every snap
--      post from the following month onward rejected -- their streak froze
--      permanently with no error shown.
--   2. snap_streaks: the INSERT branch raised on revivals_used > 0, which is
--      exactly what reviveStreak() upserts for a user who has no row yet, so a
--      first-ever revival always failed.
--   3. study_snaps / ai_chat_sessions: the caps were evaluated against the
--      UTC day while the client computes its own limits against the device's
--      LOCAL day. For this app's mostly UTC+8 userbase the two windows
--      disagreed for 8 hours daily -- the UI said "1 snap left", the insert
--      was rejected after the image had already uploaded (orphaning it in
--      storage), and the user saw only a generic "Upload failed".
--
-- Design change: these server-side checks are a BACKSTOP against a modified
-- client spamming the tables -- they are not the user-facing limit (the app
-- enforces the exact per-plan numbers itself, and the revenue-critical AI
-- token limits are enforced separately and precisely in the Edge Functions).
-- So they now enforce a GENEROUS hard ceiling instead of the exact plan cap.
-- That keeps abuse bounded while making it impossible for a timezone edge or a
-- carried-over stored value to block a real user. Trade-off accepted
-- deliberately: a modified client could exceed the exact cap up to the
-- ceiling, but these are cosmetic/storage features, not paid entitlements.
--
-- Idempotent and non-destructive: replaces function bodies only. No table,
-- column, policy or row is altered, and no user data is read or written.

-- ── 1. study_snaps: generous per-UTC-day ceiling, timezone-proof ─────────────
create or replace function public.study_snaps_enforce_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_ceiling int;
  v_count int;
begin
  if auth.uid() is null then
    return new; -- service role / server-side writes are trusted
  end if;

  select subscription_plan into v_plan from public.profiles where id = new.user_id;

  if v_plan = 'pro' then
    return new; -- unlimited by plan
  end if;

  -- Client-enforced plan caps are 1/day (free) and 3/day (plus). These
  -- ceilings sit well above them so no legitimate poster is ever blocked,
  -- regardless of the user's timezone offset from UTC.
  v_ceiling := case when v_plan = 'plus' then 20 else 10 end;

  select count(*) into v_count
  from public.study_snaps
  where user_id = new.user_id
    and created_at >= now() - interval '24 hours';

  if v_count >= v_ceiling then
    raise exception 'Daily snap limit reached';
  end if;

  return new;
end;
$$;

-- ── 2. snap_streaks: only police a revival that is actually being consumed ───
create or replace function public.snap_streaks_enforce_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max_revivals int;
  v_prev_used int;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Structural sanity that every legitimate code path already satisfies.
  if new.longest_streak < new.current_streak then
    raise exception 'longest_streak cannot be less than current_streak';
  end if;

  -- Deliberately NO validation of revival_month itself: ordinary snap posts
  -- carry a stale stored month through unchanged and must pass untouched
  -- (this was failure mode #1 above).
  --
  -- Treat the previous count as 0 whenever the month changes, so a genuine
  -- month rollover starts a fresh allowance, and an INSERT for a brand-new
  -- user is allowed to consume their first revival (failure mode #2).
  v_prev_used := case
    when tg_op = 'UPDATE' and new.revival_month = old.revival_month then old.revivals_used
    else 0
  end;

  if new.revivals_used > v_prev_used then
    select subscription_plan into v_plan from public.profiles where id = new.user_id;
    v_max_revivals := case when v_plan = 'pro' then 3 when v_plan = 'plus' then 2 else 1 end;
    if new.revivals_used > v_max_revivals then
      raise exception 'Monthly streak revival limit reached for your plan';
    end if;
  end if;

  return new;
end;
$$;

-- ── 3. ai_chat_sessions: generous ceiling ───────────────────────────────────
-- The deployed ai_generate Edge Function ALSO creates an ai_chat_sessions row
-- per chat turn (server-side, service role) whenever the caller sends no
-- session_id -- which the mobile app currently never does. Those rows count
-- toward this table's per-subject total, so the exact plan cap (1 for free)
-- was being consumed by the server itself within a couple of messages and then
-- blocking the user's own next session. A generous ceiling keeps runaway row
-- creation bounded without breaking chat.
create or replace function public.ai_chat_sessions_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_ceiling int;
  v_count int;
begin
  if auth.uid() is null then
    return new;
  end if;

  select subscription_plan into v_plan from public.profiles where id = new.user_id;
  -- Client-enforced caps are 1 / 3 / 15 per subject.
  v_ceiling := case when v_plan = 'pro' then 200 when v_plan = 'plus' then 100 else 50 end;

  select count(*) into v_count
  from public.ai_chat_sessions
  where user_id = new.user_id and subject_id = new.subject_id;

  if v_count >= v_ceiling then
    raise exception 'Saved conversation limit reached for this subject';
  end if;

  return new;
end;
$$;
