import { FEEDBACK_EVENTS, type FeedbackQuestion, type FeedbackSurveyInput, type FeedbackSurveyRow } from './api';

export const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';

export const cardCls =
  'rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900';

export const secondaryBtnCls =
  'rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900';

export const dangerBtnCls =
  'rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-800 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200';

export const primaryBtnCls =
  'rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70';

export const QUESTION_TYPE_LABEL: Record<FeedbackQuestion['type'], string> = {
  rating: 'Star rating (1–5)',
  single: 'Single choice',
  multi: 'Multiple choice',
  text: 'Free text',
};

export const EMPTY_SURVEY: FeedbackSurveyInput = {
  title_en: '',
  title_ms: null,
  intro_en: null,
  intro_ms: null,
  questions: [],
  is_active: false,
  priority: 0,
  starts_at: null,
  ends_at: null,
  min_app_opens: 3,
  trigger_event: null,
  trigger_event_count: 1,
  min_account_age_days: 3,
  target_plans: null,
  target_university_ids: null,
  target_campuses: null,
  target_platforms: null,
  min_app_version: null,
  max_prompts: 3,
  reprompt_after_days: 3,
};

/** The editable part of a stored survey (drops id, timestamps, stats). */
export function toInput(row: FeedbackSurveyRow): FeedbackSurveyInput {
  const out = { ...EMPTY_SURVEY } as Record<string, unknown>;
  for (const key of Object.keys(EMPTY_SURVEY) as (keyof FeedbackSurveyInput)[]) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out as FeedbackSurveyInput;
}

export function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Plain-language description of who sees a survey and when. */
export function describeAudience(s: FeedbackSurveyInput, universityNames: Record<string, string> = {}): string[] {
  const who: string[] = [];
  if (s.target_plans?.length) who.push(s.target_plans.map((p) => p[0].toUpperCase() + p.slice(1)).join('/') + ' users');
  else who.push('All users');
  if (s.target_university_ids?.length) {
    who.push('at ' + s.target_university_ids.map((id) => universityNames[id] ?? id).join(', '));
  }
  if (s.target_campuses?.length) who.push(`(campus: ${s.target_campuses.join(', ')})`);
  if (s.target_platforms?.length) who.push('on ' + s.target_platforms.map((p) => (p === 'ios' ? 'iOS' : 'Android')).join('/'));
  if (s.min_app_version) who.push(`with app ≥ v${s.min_app_version}`);

  const when: string[] = [];
  if (s.min_app_opens > 0) when.push(`opened the app ${s.min_app_opens}×`);
  if (s.trigger_event) {
    const ev = FEEDBACK_EVENTS.find((e) => e.id === s.trigger_event)?.label.toLowerCase() ?? s.trigger_event;
    when.push(`${ev} ${s.trigger_event_count}×`);
  }
  const lines = [who.join(' ')];
  lines.push(
    when.length
      ? `Shown after they have ${when.join(' and ')} (counted from when they first qualify).`
      : 'Shown on their next app open.',
  );
  if (s.min_account_age_days > 0) lines.push(`Only accounts at least ${s.min_account_age_days} day(s) old.`);
  if (s.starts_at || s.ends_at) lines.push(`Window: ${fmtDate(s.starts_at)} → ${fmtDate(s.ends_at)}.`);
  lines.push(
    `Asked at most ${s.max_prompts}× per user` +
      (s.max_prompts > 1 ? `, ${s.reprompt_after_days} day(s) apart if they tap “Not now”.` : '.'),
  );
  return lines;
}
