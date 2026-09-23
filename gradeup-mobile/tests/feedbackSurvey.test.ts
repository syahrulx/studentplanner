/**
 * Run: npx --yes tsx tests/feedbackSurvey.test.ts
 *
 * In-app feedback surveys have two halves that never meet in one runtime: the
 * admin_data edge function validates what admins author, and the app decides
 * when an eligible survey actually pops up. Both are pure, so both are pinned
 * here. (The server-side targeting / prompt budget lives in SQL —
 * get_feedback_surveys_for_me — and is exercised against Postgres instead.)
 */
import assert from 'node:assert/strict';

import { sanitizeFeedbackSurvey } from '../supabase/functions/_shared/feedbackSurvey';
import {
  evaluateFeedbackTriggers,
  isAnswered,
  pickLang,
  surveyHasMalay,
  type FeedbackCounters,
  type FeedbackSurvey,
} from '../src/lib/feedbackSurveyTriggers';

// ─── Admin validation (admin_data → feedback_surveys row) ────────────────────

const validInput = {
  title_en: '  Help us improve  ',
  questions: [
    { id: 'q1', type: 'rating', prompt_en: 'Rate us', required: true },
    {
      id: 'q2', type: 'multi', prompt_en: 'Pick', required: false,
      options: [{ id: 'a', label_en: 'A' }, { id: 'b', label_en: 'B', label_ms: 'Bee' }],
    },
    { id: 'q3', type: 'text', prompt_en: 'Why?', placeholder_en: 'Tell us' },
  ],
  is_active: true,
  priority: '5',
  min_app_opens: 3,
  trigger_event: 'task_completed',
  trigger_event_count: 2,
  min_account_age_days: 7,
  target_plans: ['free', 'plus', 'free', 'hacker'],
  target_platforms: ['ios', 'windows'],
  target_university_ids: [' uitm ', ''],
  target_campuses: [],
  min_app_version: '1.7.5',
  max_prompts: 99,
  reprompt_after_days: -4,
};

{
  const res = sanitizeFeedbackSurvey(validInput);
  assert.ok('row' in res, JSON.stringify(res));
  const row = res.row;
  assert.equal(row.title_en, 'Help us improve');
  assert.equal(row.is_active, true);
  assert.equal(row.priority, 5);
  assert.equal(row.trigger_event, 'task_completed');
  assert.equal(row.trigger_event_count, 2);
  // Unknown values are dropped, duplicates collapsed, empties removed.
  assert.deepEqual(row.target_plans, ['free', 'plus']);
  assert.deepEqual(row.target_platforms, ['ios']);
  assert.deepEqual(row.target_university_ids, ['uitm']);
  // An empty list means "everyone", stored as NULL.
  assert.equal(row.target_campuses, null);
  // Out-of-range numbers are clamped to what the table CHECKs allow.
  assert.equal(row.max_prompts, 20);
  assert.equal(row.reprompt_after_days, 0);
  const qs = row.questions as Record<string, unknown>[];
  assert.equal(qs[0].required, true);
  assert.equal(qs[2].required, false, 'required defaults to false');
  assert.equal(qs[2].placeholder_en, 'Tell us');
  assert.equal('options' in qs[0], false, 'ratings carry no options');
}

const reject = (patch: Record<string, unknown>, fragment: string) => {
  const res = sanitizeFeedbackSurvey({ ...validInput, ...patch });
  assert.ok('error' in res, `expected rejection for ${JSON.stringify(patch)}`);
  assert.ok(res.error.includes(fragment), `"${res.error}" should mention "${fragment}"`);
};

reject({ title_en: '   ' }, 'title');
reject({ questions: [] }, 'at least one question');
reject({ questions: Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, type: 'text', prompt_en: 'x' })) }, 'at most 20');
reject({ questions: [{ id: 'q1', type: 'rating', prompt_en: 'a' }, { id: 'q1', type: 'text', prompt_en: 'b' }] }, 'duplicate id');
reject({ questions: [{ id: 'bad id!', type: 'rating', prompt_en: 'a' }] }, 'invalid id');
reject({ questions: [{ id: 'q1', type: 'slider', prompt_en: 'a' }] }, 'unknown type');
reject({ questions: [{ id: 'q1', type: 'rating', prompt_en: '' }] }, 'question text');
reject({ questions: [{ id: 'q1', type: 'single', prompt_en: 'a', options: [{ id: 'o', label_en: 'x' }] }] }, 'at least 2 choices');
reject({ questions: [{ id: 'q1', type: 'single', prompt_en: 'a', options: [{ id: 'o', label_en: 'x' }, { id: 'o', label_en: 'y' }] }] }, 'duplicate');
reject({ questions: [{ id: 'q1', type: 'single', prompt_en: 'a', options: [{ id: 'o', label_en: 'x' }, { id: 'p', label_en: '' }] }] }, 'English label');
reject({ trigger_event: 'opened_settings' }, 'Unknown trigger');
reject({ min_app_version: 'v1.7' }, 'version');
reject({ starts_at: 'not a date' }, 'Invalid start');
reject({ starts_at: '2026-10-02T00:00:00Z', ends_at: '2026-10-01T00:00:00Z' }, 'after the start');

// ─── App triggers (which eligible survey pops up, and when) ──────────────────

const survey = (id: string, patch: Partial<FeedbackSurvey> = {}): FeedbackSurvey => ({
  id,
  title_en: id,
  title_ms: null,
  intro_en: null,
  intro_ms: null,
  questions: [{ id: 'q1', type: 'rating', prompt_en: 'Rate', required: true }],
  min_app_opens: 0,
  trigger_event: null,
  trigger_event_count: 1,
  ...patch,
});

const OPEN = { kind: 'open' } as const;
const TASK = { kind: 'event', event: 'task_completed' } as const;
const QUIZ = { kind: 'event', event: 'quiz_completed' } as const;

/** Replays a device: counters move, baselines persist between checks. */
function device(opens: number, events: FeedbackCounters['events'] = {}) {
  let baselines: Record<string, FeedbackCounters> = {};
  const counters: FeedbackCounters = { opens, events: { ...events } };
  return {
    counters,
    check(candidates: FeedbackSurvey[], context: Parameters<typeof evaluateFeedbackTriggers>[3]) {
      const res = evaluateFeedbackTriggers(candidates, counters, baselines, context);
      baselines = res.baselines;
      return res.picked?.id ?? null;
    },
  };
}

{
  // No local triggers: shows on the next open, never after an action.
  const d = device(40);
  assert.equal(d.check([survey('s')], TASK), null);
  assert.equal(d.check([survey('s')], OPEN), 's');
}

{
  // "After 3 app opens" counts from when the user first qualified — a user who
  // already opened the app 40 times is not prompted the moment it goes live.
  const s = survey('s', { min_app_opens: 3 });
  const d = device(40);
  assert.equal(d.check([s], OPEN), null, 'baseline taken, 0 opens since');
  d.counters.opens += 2;
  assert.equal(d.check([s], OPEN), null, '2 opens since');
  d.counters.opens += 1;
  assert.equal(d.check([s], OPEN), 's', '3 opens since');
}

{
  // "After completing 2 tasks": past completions do not count, and the popup
  // only appears right after the qualifying action — not on an app open.
  const s = survey('s', { trigger_event: 'task_completed', trigger_event_count: 2 });
  const d = device(10, { task_completed: 500 });
  assert.equal(d.check([s], OPEN), null, 'baseline taken');
  d.counters.events.task_completed = 501;
  assert.equal(d.check([s], TASK), null, '1 task since');
  d.counters.events.task_completed = 502;
  assert.equal(d.check([s], OPEN), null, 'count met, but an app open is not the action');
  assert.equal(d.check([s], QUIZ), null, 'a different action does not fire it');
  assert.equal(d.check([s], TASK), 's', 'fires right after the 2nd task');
}

{
  // Both conditions must hold (AND): action count met but not enough opens.
  const s = survey('s', { min_app_opens: 2, trigger_event: 'quiz_completed', trigger_event_count: 1 });
  const d = device(0);
  d.check([s], OPEN);
  d.counters.events.quiz_completed = 1;
  assert.equal(d.check([s], QUIZ), null, 'opens not met yet');
  d.counters.opens = 2;
  d.counters.events.quiz_completed = 2;
  assert.equal(d.check([s], QUIZ), 's');
}

{
  // Server order is priority order: the first survey whose triggers are met
  // wins, but every candidate still gets its baseline recorded.
  const high = survey('high', { min_app_opens: 5 });
  const low = survey('low');
  const d = device(0);
  const first = evaluateFeedbackTriggers([high, low], d.counters, {}, OPEN);
  assert.equal(first.picked?.id, 'low', 'high not ready yet, low is');
  assert.deepEqual(Object.keys(first.baselines).sort(), ['high', 'low']);
  assert.equal(first.changed, true);
  const again = evaluateFeedbackTriggers([high, low], { opens: 5, events: {} }, first.baselines, OPEN);
  assert.equal(again.picked?.id, 'high', 'once ready, the higher priority wins');
  assert.equal(again.changed, false, 'no new baselines to persist');
}

// ─── Popup helpers ───────────────────────────────────────────────────────────

assert.equal(surveyHasMalay(survey('en-only')), false, 'no BM toggle when admin wrote no BM');
assert.equal(surveyHasMalay(survey('bm', { title_ms: 'Tajuk' })), true);
assert.equal(
  surveyHasMalay(survey('bm-option', {
    questions: [{ id: 'q', type: 'single', prompt_en: 'x', required: true, options: [{ id: 'a', label_en: 'A', label_ms: 'Ya' }] }],
  })),
  true,
);
assert.equal(pickLang('Hello', 'Hai', 'ms'), 'Hai');
assert.equal(pickLang('Hello', null, 'ms'), 'Hello', 'empty BM falls back to English');
assert.equal(pickLang('Hello', 'Hai', 'en'), 'Hello');

const multi = { id: 'm', type: 'multi', prompt_en: 'x', required: true } as const;
const text = { id: 't', type: 'text', prompt_en: 'x', required: true } as const;
assert.equal(isAnswered(multi, []), false);
assert.equal(isAnswered(multi, ['a']), true);
assert.equal(isAnswered(text, '   '), false, 'whitespace is not an answer');
assert.equal(isAnswered(text, 'ok'), true);

console.log('feedbackSurvey: all assertions passed');
