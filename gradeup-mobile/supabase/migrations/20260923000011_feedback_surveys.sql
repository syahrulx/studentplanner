-- =============================================================================
-- 20260923000011: In-app feedback surveys (admin-authored, shown as a popup)
-- =============================================================================
-- Admins author surveys in admin-web (questions, triggers, targeting, how often
-- to re-ask); the app shows the first eligible one as a bottom sheet and the
-- answers land here for the developers — not in any store review.
--
-- Split of responsibilities:
--   * Server (get_feedback_surveys_for_me) decides everything it can know:
--     active window, targeting (plan / university / campus / platform / app
--     version), account age, and the per-user prompt budget (max_prompts,
--     reprompt_after_days, already answered).
--   * App decides the device-local triggers: "opened the app N times" and
--     "did action X N times", both counted from the moment the user first
--     became eligible for that survey, so long-time users are not prompted
--     the instant a survey goes live.
--
-- All three tables have RLS on and no policies: clients only reach them
-- through the SECURITY DEFINER RPCs below, admin-web through the admin_data
-- edge function (service role).
--
-- `survey_responses` already exists (FYP community surveys), hence the
-- `feedback_` prefix.

-- ─── Version comparison ──────────────────────────────────────────────────────
-- "1.7.5" → {1,7,5,0}. Padded to four parts so "1.7" equals "1.7.0" (Postgres
-- array comparison treats a shorter prefix as smaller). Non-digits are dropped
-- and each part is capped at 9 digits so junk input cannot overflow int.

create or replace function public.feedback_version_parts(p_version text)
returns int[]
language sql immutable
set search_path = public
as $$
  select array(
    select coalesce(
             nullif(left(regexp_replace(split_part(coalesce(p_version, ''), '.', i), '\D', '', 'g'), 9), '')::int,
             0
           )
    from generate_series(1, 4) as i
    order by i
  );
$$;

-- ─── Surveys ─────────────────────────────────────────────────────────────────

create table if not exists public.feedback_surveys (
  id uuid primary key default gen_random_uuid(),
  title_en text not null check (char_length(title_en) between 1 and 120),
  title_ms text check (title_ms is null or char_length(title_ms) <= 120),
  intro_en text check (intro_en is null or char_length(intro_en) <= 500),
  intro_ms text check (intro_ms is null or char_length(intro_ms) <= 500),
  -- [{ id, type: rating|single|multi|text, prompt_en, prompt_ms?, required,
  --    options?: [{ id, label_en, label_ms? }], placeholder_en?, placeholder_ms? }]
  -- Shape is validated by the admin_data edge function on write and re-checked
  -- against each answer in submit_feedback_survey_response.
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  is_active boolean not null default false,
  priority integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  -- Device-local triggers (evaluated by the app).
  min_app_opens integer not null default 0 check (min_app_opens between 0 and 1000),
  trigger_event text check (trigger_event is null or trigger_event in (
    'task_completed', 'smart_capture_added', 'quiz_completed',
    'focus_session_completed', 'flashcard_review_completed'
  )),
  trigger_event_count integer not null default 1 check (trigger_event_count between 1 and 1000),
  -- Server-side triggers / targeting. NULL or empty array = no filter.
  min_account_age_days integer not null default 0 check (min_account_age_days between 0 and 3650),
  target_plans text[] check (target_plans is null or target_plans <@ array['free', 'plus', 'pro']),
  target_university_ids text[],
  target_campuses text[],
  target_platforms text[] check (target_platforms is null or target_platforms <@ array['ios', 'android']),
  min_app_version text check (min_app_version is null or min_app_version ~ '^\d+(\.\d+){0,3}$'),
  -- Prompt budget per user.
  max_prompts integer not null default 3 check (max_prompts between 1 and 20),
  reprompt_after_days integer not null default 3 check (reprompt_after_days between 0 and 365),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists feedback_surveys_active_idx
  on public.feedback_surveys (priority desc, created_at desc)
  where is_active;

drop trigger if exists feedback_surveys_set_updated_at on public.feedback_surveys;
create trigger feedback_surveys_set_updated_at
  before update on public.feedback_surveys
  for each row execute function public.set_updated_at();

alter table public.feedback_surveys enable row level security;

comment on table public.feedback_surveys is
  'Admin-authored in-app feedback surveys. Written only by admin_data (service role); read by the app only through get_feedback_surveys_for_me.';

-- ─── Per-user prompt state ───────────────────────────────────────────────────

create table if not exists public.feedback_survey_user_state (
  survey_id uuid not null references public.feedback_surveys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shown_count integer not null default 0,
  dismissed_count integer not null default 0,
  first_shown_at timestamptz,
  last_shown_at timestamptz,
  completed_at timestamptz,
  primary key (survey_id, user_id)
);

create index if not exists feedback_survey_user_state_user_idx
  on public.feedback_survey_user_state (user_id);

alter table public.feedback_survey_user_state enable row level security;

-- ─── Responses ───────────────────────────────────────────────────────────────

create table if not exists public.feedback_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.feedback_surveys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- { "<question id>": 4 | "<option id>" | ["<option id>", …] | "free text" }
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  language text not null default 'en' check (language in ('en', 'ms')),
  platform text,
  app_version text,
  -- Snapshot of who answered, taken at submit time, so results stay
  -- interpretable after the user upgrades or moves campus.
  plan text,
  university_id text,
  university text,
  campus text,
  created_at timestamptz not null default now(),
  unique (survey_id, user_id)
);

create index if not exists feedback_survey_responses_survey_created_idx
  on public.feedback_survey_responses (survey_id, created_at desc);
create index if not exists feedback_survey_responses_user_idx
  on public.feedback_survey_responses (user_id);

alter table public.feedback_survey_responses enable row level security;

revoke all on public.feedback_surveys, public.feedback_survey_user_state, public.feedback_survey_responses
  from anon, authenticated;

-- ─── App: which surveys may I be shown right now? ────────────────────────────
-- Returns surveys ordered by priority; the app applies its local triggers and
-- shows at most one.

create or replace function public.get_feedback_surveys_for_me(
  p_platform text,
  p_app_version text
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_account_created timestamptz;
  v_plan text;
  v_university_id text;
  v_campus text;
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_version int[] := public.feedback_version_parts(p_app_version);
  v_result jsonb;
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  select u.created_at,
         case when p.subscription_plan in ('plus', 'pro') then p.subscription_plan else 'free' end,
         p.university_id,
         p.campus
    into v_account_created, v_plan, v_university_id, v_campus
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = v_uid;

  if v_account_created is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', s.id,
             'title_en', s.title_en,
             'title_ms', s.title_ms,
             'intro_en', s.intro_en,
             'intro_ms', s.intro_ms,
             'questions', s.questions,
             'min_app_opens', s.min_app_opens,
             'trigger_event', s.trigger_event,
             'trigger_event_count', s.trigger_event_count
           )
           order by s.priority desc, s.created_at desc
         ), '[]'::jsonb)
    into v_result
    from public.feedback_surveys s
    left join public.feedback_survey_user_state st
      on st.survey_id = s.id and st.user_id = v_uid
   where s.is_active
     and jsonb_array_length(s.questions) > 0
     and (s.starts_at is null or s.starts_at <= now())
     and (s.ends_at is null or s.ends_at > now())
     and st.completed_at is null
     and coalesce(st.shown_count, 0) < s.max_prompts
     and (st.last_shown_at is null
          or st.last_shown_at <= now() - make_interval(days => s.reprompt_after_days))
     and v_account_created <= now() - make_interval(days => s.min_account_age_days)
     and (coalesce(cardinality(s.target_plans), 0) = 0 or v_plan = any(s.target_plans))
     and (coalesce(cardinality(s.target_university_ids), 0) = 0
          or v_university_id = any(s.target_university_ids))
     and (coalesce(cardinality(s.target_campuses), 0) = 0
          or exists (
               select 1 from unnest(s.target_campuses) as c(name)
                where public.campus_names_match(c.name, v_campus)
             ))
     and (coalesce(cardinality(s.target_platforms), 0) = 0 or v_platform = any(s.target_platforms))
     and (s.min_app_version is null or v_version >= public.feedback_version_parts(s.min_app_version));

  return v_result;
end;
$$;

revoke all on function public.get_feedback_surveys_for_me(text, text) from public, anon;
grant execute on function public.get_feedback_surveys_for_me(text, text) to authenticated;

-- ─── App: the popup was shown / dismissed ────────────────────────────────────

create or replace function public.record_feedback_survey_event(
  p_survey_id uuid,
  p_event text
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_event not in ('shown', 'dismissed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_event');
  end if;
  if not exists (select 1 from public.feedback_surveys where id = p_survey_id and is_active) then
    return jsonb_build_object('ok', false, 'error', 'survey_unavailable');
  end if;

  if p_event = 'shown' then
    insert into public.feedback_survey_user_state as st
      (survey_id, user_id, shown_count, first_shown_at, last_shown_at)
    values (p_survey_id, v_uid, 1, now(), now())
    on conflict (survey_id, user_id) do update
      set shown_count = st.shown_count + 1,
          last_shown_at = now();
  else
    update public.feedback_survey_user_state
       set dismissed_count = dismissed_count + 1
     where survey_id = p_survey_id and user_id = v_uid;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.record_feedback_survey_event(uuid, text) from public, anon;
grant execute on function public.record_feedback_survey_event(uuid, text) to authenticated;

-- ─── App: submit answers ─────────────────────────────────────────────────────
-- Every answer is checked against the survey's current questions: unknown
-- question ids are dropped, option ids must exist, ratings are integers 1–5,
-- free text is trimmed and capped at 2000 characters, required questions must
-- be answered. One response per user per survey.

create or replace function public.submit_feedback_survey_response(
  p_survey_id uuid,
  p_answers jsonb,
  p_language text,
  p_platform text,
  p_app_version text
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_questions jsonb;
  v_q jsonb;
  v_qid text;
  v_type text;
  v_required boolean;
  v_answer jsonb;
  v_option_ids text[];
  v_text text;
  v_rating numeric;
  v_multi text[];
  v_clean jsonb := '{}'::jsonb;
  v_inserted uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 40000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_answers');
  end if;

  select questions into v_questions
    from public.feedback_surveys
   where id = p_survey_id and is_active;
  if v_questions is null then
    return jsonb_build_object('ok', false, 'error', 'survey_unavailable');
  end if;

  for v_q in select value from jsonb_array_elements(v_questions) loop
    v_qid := v_q->>'id';
    v_type := v_q->>'type';
    v_required := coalesce((v_q->>'required')::boolean, false);
    v_answer := p_answers->v_qid;

    if v_answer is null or jsonb_typeof(v_answer) = 'null' then
      if v_required then
        return jsonb_build_object('ok', false, 'error', 'missing_required', 'question_id', v_qid);
      end if;
      continue;
    end if;

    select coalesce(array_agg(o->>'id'), '{}')
      into v_option_ids
      from jsonb_array_elements(coalesce(v_q->'options', '[]'::jsonb)) as o;

    if v_type = 'rating' then
      if jsonb_typeof(v_answer) <> 'number' then
        return jsonb_build_object('ok', false, 'error', 'invalid_answer', 'question_id', v_qid);
      end if;
      v_rating := (v_answer #>> '{}')::numeric;
      if v_rating <> trunc(v_rating) or v_rating < 1 or v_rating > 5 then
        return jsonb_build_object('ok', false, 'error', 'invalid_answer', 'question_id', v_qid);
      end if;
      v_clean := v_clean || jsonb_build_object(v_qid, v_rating::int);

    elsif v_type = 'single' then
      if jsonb_typeof(v_answer) <> 'string' or not ((v_answer #>> '{}') = any(v_option_ids)) then
        return jsonb_build_object('ok', false, 'error', 'invalid_answer', 'question_id', v_qid);
      end if;
      v_clean := v_clean || jsonb_build_object(v_qid, v_answer);

    elsif v_type = 'multi' then
      if jsonb_typeof(v_answer) <> 'array' then
        return jsonb_build_object('ok', false, 'error', 'invalid_answer', 'question_id', v_qid);
      end if;
      select coalesce(array_agg(distinct e), '{}')
        into v_multi
        from jsonb_array_elements_text(v_answer) as e;
      if not (v_multi <@ v_option_ids) then
        return jsonb_build_object('ok', false, 'error', 'invalid_answer', 'question_id', v_qid);
      end if;
      if cardinality(v_multi) = 0 then
        if v_required then
          return jsonb_build_object('ok', false, 'error', 'missing_required', 'question_id', v_qid);
        end if;
        continue;
      end if;
      v_clean := v_clean || jsonb_build_object(v_qid, to_jsonb(v_multi));

    elsif v_type = 'text' then
      if jsonb_typeof(v_answer) <> 'string' then
        return jsonb_build_object('ok', false, 'error', 'invalid_answer', 'question_id', v_qid);
      end if;
      v_text := left(trim(v_answer #>> '{}'), 2000);
      if v_text = '' then
        if v_required then
          return jsonb_build_object('ok', false, 'error', 'missing_required', 'question_id', v_qid);
        end if;
        continue;
      end if;
      v_clean := v_clean || jsonb_build_object(v_qid, v_text);
    end if;
  end loop;

  if v_clean = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_response');
  end if;

  insert into public.feedback_survey_responses
    (survey_id, user_id, answers, language, platform, app_version, plan, university_id, university, campus)
  select p_survey_id,
         v_uid,
         v_clean,
         case when p_language = 'ms' then 'ms' else 'en' end,
         left(lower(trim(coalesce(p_platform, ''))), 20),
         left(trim(coalesce(p_app_version, '')), 20),
         case when p.subscription_plan in ('plus', 'pro') then p.subscription_plan else 'free' end,
         p.university_id,
         p.university,
         p.campus
    from (select 1) as one
    left join public.profiles p on p.id = v_uid
  on conflict (survey_id, user_id) do nothing
  returning id into v_inserted;

  insert into public.feedback_survey_user_state as st
    (survey_id, user_id, completed_at)
  values (p_survey_id, v_uid, now())
  on conflict (survey_id, user_id) do update
    set completed_at = coalesce(st.completed_at, now());

  if v_inserted is null then
    return jsonb_build_object('ok', true, 'already_submitted', true);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_feedback_survey_response(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.submit_feedback_survey_response(uuid, jsonb, text, text, text) to authenticated;

-- ─── Admin: funnel numbers per survey (service role only) ────────────────────

create or replace function public.feedback_survey_stats()
returns table (
  survey_id uuid,
  reached_users bigint,
  times_shown bigint,
  times_dismissed bigint,
  responses bigint
)
language sql stable security definer set search_path = public
as $$
  select s.id,
         coalesce(st.reached_users, 0),
         coalesce(st.times_shown, 0),
         coalesce(st.times_dismissed, 0),
         coalesce(r.responses, 0)
    from public.feedback_surveys s
    left join (
      select survey_id,
             count(*) filter (where shown_count > 0) as reached_users,
             sum(shown_count) as times_shown,
             sum(dismissed_count) as times_dismissed
        from public.feedback_survey_user_state
       group by survey_id
    ) st on st.survey_id = s.id
    left join (
      select survey_id, count(*) as responses
        from public.feedback_survey_responses
       group by survey_id
    ) r on r.survey_id = s.id;
$$;

revoke all on function public.feedback_survey_stats() from public, anon, authenticated;
grant execute on function public.feedback_survey_stats() to service_role;
