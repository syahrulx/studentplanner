// Pure logic for in-app feedback surveys — no React Native imports, so it is
// unit-tested directly by tests/feedbackSurvey.test.ts. Storage and network
// live in ./feedbackSurvey.ts.

/**
 * Actions an admin can choose as a trigger. Keep in sync with the CHECK on
 * feedback_surveys.trigger_event, FEEDBACK_EVENTS in admin_data, and
 * FEEDBACK_EVENTS in admin-web/src/lib/api.ts.
 */
export type FeedbackEvent =
  | 'task_completed'
  | 'smart_capture_added'
  | 'quiz_completed'
  | 'focus_session_completed'
  | 'flashcard_review_completed';

export type FeedbackLanguage = 'en' | 'ms';

export type FeedbackOption = { id: string; label_en: string; label_ms?: string | null };

export type FeedbackQuestion = {
  id: string;
  type: 'rating' | 'single' | 'multi' | 'text';
  prompt_en: string;
  prompt_ms?: string | null;
  required: boolean;
  options?: FeedbackOption[];
  placeholder_en?: string | null;
  placeholder_ms?: string | null;
};

export type FeedbackSurvey = {
  id: string;
  title_en: string;
  title_ms: string | null;
  intro_en: string | null;
  intro_ms: string | null;
  questions: FeedbackQuestion[];
  min_app_opens: number;
  trigger_event: FeedbackEvent | null;
  trigger_event_count: number;
};

export type FeedbackAnswer = number | string | string[];
export type FeedbackAnswers = Record<string, FeedbackAnswer>;

/** Where an eligibility check was triggered from. */
export type FeedbackCheckContext = { kind: 'open' } | { kind: 'event'; event: FeedbackEvent };

/** Device-local counts: app opens and recorded actions. */
export type FeedbackCounters = { opens: number; events: Partial<Record<FeedbackEvent, number>> };

/**
 * First survey (in the server's priority order) whose local triggers are met.
 *
 * Counts are measured from a per-survey baseline taken the first time the user
 * qualifies for that survey, so a newly published survey never fires
 * instantly for a long-time user. A survey with an action trigger is only ever
 * picked right after that action, so the popup appears in context rather than
 * on some later app open. Returns updated baselines for the caller to persist.
 */
export function evaluateFeedbackTriggers(
  candidates: FeedbackSurvey[],
  counters: FeedbackCounters,
  baselines: Record<string, FeedbackCounters>,
  context: FeedbackCheckContext,
): { picked: FeedbackSurvey | null; baselines: Record<string, FeedbackCounters>; changed: boolean } {
  const next = { ...baselines };
  let changed = false;
  let picked: FeedbackSurvey | null = null;

  for (const s of candidates) {
    let base = next[s.id];
    if (!base) {
      base = { opens: counters.opens, events: { ...counters.events } };
      next[s.id] = base;
      changed = true;
    }
    if (picked) continue;

    const opensSince = counters.opens - base.opens;
    if (opensSince < (s.min_app_opens ?? 0)) continue;

    if (s.trigger_event) {
      if (context.kind !== 'event' || context.event !== s.trigger_event) continue;
      const since = (counters.events[s.trigger_event] ?? 0) - (base.events[s.trigger_event] ?? 0);
      if (since < Math.max(1, s.trigger_event_count ?? 1)) continue;
    } else if (context.kind !== 'open') {
      continue;
    }
    picked = s;
  }

  return { picked, baselines: next, changed };
}

// ─── Display helpers ─────────────────────────────────────────────────────────

/** Whether the admin filled in any Bahasa Melayu text, i.e. the BM toggle is worth showing. */
export function surveyHasMalay(s: FeedbackSurvey): boolean {
  if (s.title_ms || s.intro_ms) return true;
  return s.questions.some((q) => q.prompt_ms || q.placeholder_ms || q.options?.some((o) => o.label_ms));
}

/** Pick the requested language, falling back to English when a BM field was left empty. */
export function pickLang(en: string | null | undefined, ms: string | null | undefined, lang: FeedbackLanguage): string {
  return (lang === 'ms' && ms ? ms : en) ?? '';
}

/** Whether a question has a usable answer (required questions gate "Next"). */
export function isAnswered(q: FeedbackQuestion, a: FeedbackAnswer | undefined): boolean {
  if (a == null) return false;
  if (q.type === 'multi') return Array.isArray(a) && a.length > 0;
  if (q.type === 'text') return typeof a === 'string' && a.trim().length > 0;
  return true;
}
