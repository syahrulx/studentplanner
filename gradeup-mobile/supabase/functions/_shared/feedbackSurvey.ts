// Validation for admin-authored feedback surveys (feedback_surveys table).
// Dependency-free so it runs under Deno (admin_data) and under tsx in
// gradeup-mobile/tests/feedbackSurvey.test.ts.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keep in sync with the CHECK on feedback_surveys.trigger_event, with
// FEEDBACK_EVENTS in admin-web/src/lib/api.ts, and with the events the app
// records in gradeup-mobile/src/lib/feedbackSurvey.ts.
export const FEEDBACK_EVENTS = [
  'task_completed', 'smart_capture_added', 'quiz_completed',
  'focus_session_completed', 'flashcard_review_completed',
];
const FEEDBACK_QUESTION_TYPES = ['rating', 'single', 'multi', 'text'];
const FEEDBACK_ID_RE = /^[a-z0-9_-]{1,40}$/i;

function optText(v: unknown, max: number): string | null {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
}

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function textList(v: unknown, allowed?: string[]): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map((x) => String(x ?? '').trim()).filter(Boolean))]
    .filter((x) => !allowed || allowed.includes(x))
    .slice(0, 300);
  return out.length > 0 ? out : null;
}

function isoOrNull(v: unknown): string | null | 'invalid' {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 'invalid' : d.toISOString();
}

/** Validate an admin-authored survey into a feedback_surveys row. */
export function sanitizeFeedbackSurvey(raw: unknown): { row: Record<string, unknown> } | { error: string } {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const titleEn = optText(s.title_en, 120);
  if (!titleEn) return { error: 'English title is required.' };

  const rawQuestions = Array.isArray(s.questions) ? s.questions : [];
  if (rawQuestions.length === 0) return { error: 'Add at least one question.' };
  if (rawQuestions.length > 20) return { error: 'A survey can have at most 20 questions.' };

  const questionIds = new Set<string>();
  const questions: Record<string, unknown>[] = [];
  for (const [qi, rq] of rawQuestions.entries()) {
    const q = (rq && typeof rq === 'object' ? rq : {}) as Record<string, unknown>;
    const label = `Question ${qi + 1}`;
    const id = String(q.id ?? '').trim();
    if (!FEEDBACK_ID_RE.test(id)) return { error: `${label}: invalid id.` };
    if (questionIds.has(id)) return { error: `${label}: duplicate id "${id}".` };
    questionIds.add(id);
    const type = String(q.type ?? '');
    if (!FEEDBACK_QUESTION_TYPES.includes(type)) return { error: `${label}: unknown type.` };
    const promptEn = optText(q.prompt_en, 300);
    if (!promptEn) return { error: `${label}: English question text is required.` };

    const question: Record<string, unknown> = {
      id,
      type,
      prompt_en: promptEn,
      prompt_ms: optText(q.prompt_ms, 300),
      required: q.required === true,
    };

    if (type === 'single' || type === 'multi') {
      const rawOptions = Array.isArray(q.options) ? q.options : [];
      if (rawOptions.length < 2) return { error: `${label}: add at least 2 choices.` };
      if (rawOptions.length > 12) return { error: `${label}: at most 12 choices.` };
      const optionIds = new Set<string>();
      const options: Record<string, unknown>[] = [];
      for (const [oi, ro] of rawOptions.entries()) {
        const o = (ro && typeof ro === 'object' ? ro : {}) as Record<string, unknown>;
        const oid = String(o.id ?? '').trim();
        if (!FEEDBACK_ID_RE.test(oid) || optionIds.has(oid)) {
          return { error: `${label}, choice ${oi + 1}: invalid or duplicate id.` };
        }
        optionIds.add(oid);
        const labelEn = optText(o.label_en, 120);
        if (!labelEn) return { error: `${label}, choice ${oi + 1}: English label is required.` };
        options.push({ id: oid, label_en: labelEn, label_ms: optText(o.label_ms, 120) });
      }
      question.options = options;
    }
    if (type === 'text') {
      question.placeholder_en = optText(q.placeholder_en, 120);
      question.placeholder_ms = optText(q.placeholder_ms, 120);
    }
    questions.push(question);
  }

  const startsAt = isoOrNull(s.starts_at);
  const endsAt = isoOrNull(s.ends_at);
  if (startsAt === 'invalid' || endsAt === 'invalid') return { error: 'Invalid start or end date.' };
  if (startsAt && endsAt && endsAt <= startsAt) return { error: 'End date must be after the start date.' };

  const triggerEvent = s.trigger_event ? String(s.trigger_event) : null;
  if (triggerEvent && !FEEDBACK_EVENTS.includes(triggerEvent)) return { error: 'Unknown trigger action.' };

  const minVersion = optText(s.min_app_version, 20);
  if (minVersion && !/^\d+(\.\d+){0,3}$/.test(minVersion)) {
    return { error: 'Minimum app version must look like 1.7.5.' };
  }

  return {
    row: {
      title_en: titleEn,
      title_ms: optText(s.title_ms, 120),
      intro_en: optText(s.intro_en, 500),
      intro_ms: optText(s.intro_ms, 500),
      questions,
      is_active: s.is_active === true,
      priority: intIn(s.priority, -1000, 1000, 0),
      starts_at: startsAt,
      ends_at: endsAt,
      min_app_opens: intIn(s.min_app_opens, 0, 1000, 0),
      trigger_event: triggerEvent,
      trigger_event_count: intIn(s.trigger_event_count, 1, 1000, 1),
      min_account_age_days: intIn(s.min_account_age_days, 0, 3650, 0),
      target_plans: textList(s.target_plans, ['free', 'plus', 'pro']),
      target_university_ids: textList(s.target_university_ids),
      target_campuses: textList(s.target_campuses),
      target_platforms: textList(s.target_platforms, ['ios', 'android']),
      min_app_version: minVersion,
      max_prompts: intIn(s.max_prompts, 1, 20, 3),
      reprompt_after_days: intIn(s.reprompt_after_days, 0, 365, 3),
    },
  };
}
