-- Feedback survey: "Why do you use Rencana?" — one question, nothing else.
--
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run (fixed id, do nothing
-- on conflict). It goes in INACTIVE: review it in admin-web → Feedback Surveys,
-- then press "Turn on". Every setting below can be changed there afterwards.
--
-- Multiple choice rather than free text so the Results page gives percentages
-- straight away (students rarely use an app for one reason, hence multi). The
-- choices map to what the app actually does; "Something else" keeps the list
-- honest. A free-text variant is at the bottom if you would rather read answers.
--
-- Who / when / how often:
--   * everyone (no plan, university, campus, platform or version filter)
--   * account at least 7 days old and 2 app opens after first qualifying, so
--     they have used it enough to answer — brand-new users are not asked
--   * asked at most 2 times per user, 5 days apart if they tap X ("Not now")
--
-- Question and choice ids (why, planner, …) are what answers are stored
-- under. Reword the labels freely; do not rename or delete an id once
-- responses exist, or older answers show as "(removed choice …)".

insert into public.feedback_surveys (
  id,
  title_en, title_ms,
  intro_en, intro_ms,
  questions,
  is_active, priority,
  starts_at, ends_at,
  min_app_opens, trigger_event, trigger_event_count,
  min_account_age_days,
  target_plans, target_university_ids, target_campuses, target_platforms, min_app_version,
  max_prompts, reprompt_after_days
) values (
  '4848bed5-d0ef-437b-9bc2-0b03fc3bbadf',
  'Quick question', 'Soalan ringkas',
  'One tap. It goes straight to the people building Rencana.',
  'Satu tekan je. Terus sampai kepada team yang membina Rencana.',
  $json$[
    {
      "id": "why",
      "type": "multi",
      "prompt_en": "Why do you use Rencana?",
      "prompt_ms": "Kenapa anda guna Rencana?",
      "required": true,
      "options": [
        { "id": "planner",   "label_en": "Keep track of assignments and deadlines", "label_ms": "Jejak assignment dan tarikh akhir" },
        { "id": "timetable", "label_en": "See my class timetable",                  "label_ms": "Tengok jadual kelas" },
        { "id": "calendar",  "label_en": "Know the academic calendar and week",      "label_ms": "Tahu kalendar akademik dan minggu" },
        { "id": "ai",        "label_en": "AI turns messages and notes into tasks",   "label_ms": "AI tukar mesej dan nota jadi task" },
        { "id": "study",     "label_en": "Study with flashcards and quizzes",        "label_ms": "Belajar guna flashcard dan kuiz" },
        { "id": "grades",    "label_en": "Plan my grades and CGPA",                  "label_ms": "Rancang gred dan CGPA" },
        { "id": "community", "label_en": "Campus community and friends",             "label_ms": "Komuniti kampus dan kawan-kawan" },
        { "id": "other",     "label_en": "Something else",                           "label_ms": "Sebab lain" }
      ]
    }
  ]$json$::jsonb,
  false, 0,
  null, null,
  2, null, 1,
  7,
  null, null, null, null, null,
  2, 5
)
on conflict (id) do nothing;

-- Check it went in (expect one row, is_active = false):
select id, title_en, is_active, jsonb_array_length(questions) as questions,
       min_app_opens, min_account_age_days, max_prompts, reprompt_after_days
  from public.feedback_surveys
 where id = '4848bed5-d0ef-437b-9bc2-0b03fc3bbadf';

-- ─── Free-text variant ───────────────────────────────────────────────────────
-- To ask it as an open question instead, run this after the insert above
-- (before any responses come in):
--
-- update public.feedback_surveys
--    set questions = $json$[
--      {
--        "id": "why_text",
--        "type": "text",
--        "prompt_en": "Why do you use Rencana?",
--        "prompt_ms": "Kenapa anda guna Rencana?",
--        "required": true,
--        "placeholder_en": "The main reason, in your own words…",
--        "placeholder_ms": "Sebab utama, dalam ayat anda sendiri…"
--      }
--    ]$json$::jsonb
--  where id = '4848bed5-d0ef-437b-9bc2-0b03fc3bbadf';
