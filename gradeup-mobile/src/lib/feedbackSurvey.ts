import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getCurrentAppVersion } from './appVersion';
import { currentUserId, scopedKey } from './scopedStorage';
import { supabase } from './supabase';
import {
  evaluateFeedbackTriggers,
  type FeedbackAnswers,
  type FeedbackCheckContext,
  type FeedbackCounters,
  type FeedbackEvent,
  type FeedbackLanguage,
  type FeedbackSurvey,
} from './feedbackSurveyTriggers';

export * from './feedbackSurveyTriggers';

// In-app feedback surveys, authored in admin-web (Feedback Surveys) and stored
// in public.feedback_surveys. The server filters by targeting, account age and
// the per-user prompt budget; this module owns the device-local triggers —
// "opened the app N times" and "did action X N times" — counted from the
// moment the user first qualifies for each survey, so a newly published survey
// never fires instantly for a long-time user.

const COUNTERS_KEY = 'feedbackSurvey:v1:counters';
const BASELINES_KEY = 'feedbackSurvey:v1:baselines';

// ─── Local counters ──────────────────────────────────────────────────────────
// Events can fire in quick succession (ticking off several tasks), so every
// read-modify-write goes through one promise chain.

let writeChain: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

async function readCounters(uid: string): Promise<FeedbackCounters> {
  return readJson<FeedbackCounters>(scopedKey(COUNTERS_KEY, uid), { opens: 0, events: {} });
}

async function bumpCounters(mutate: (c: FeedbackCounters) => void): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  await serialized(async () => {
    const c = await readCounters(uid);
    mutate(c);
    await AsyncStorage.setItem(scopedKey(COUNTERS_KEY, uid), JSON.stringify(c));
  }).catch(() => {});
}

type Listener = (event: FeedbackEvent) => void;
const listeners = new Set<Listener>();

/** Subscribe to recorded actions (used by the popup to check right after one). */
export function onFeedbackEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Record that the user did something a survey may be waiting for. Fire-and-forget. */
export function recordFeedbackEvent(event: FeedbackEvent): void {
  void bumpCounters((c) => {
    c.events[event] = (c.events[event] ?? 0) + 1;
  }).then(() => {
    for (const l of listeners) l(event);
  });
}

/** Record one app open (cold start, or foreground after a long background). */
export function recordFeedbackAppOpen(): Promise<void> {
  return bumpCounters((c) => {
    c.opens += 1;
  });
}

// ─── Other overlays ──────────────────────────────────────────────────────────
// The survey never stacks on top of What's New or the update prompt.

const blockingOverlays = new Set<string>();

export function setFeedbackBlockingOverlay(key: string, visible: boolean): void {
  if (visible) blockingOverlays.add(key);
  else blockingOverlays.delete(key);
}

export function hasFeedbackBlockingOverlay(): boolean {
  return blockingOverlays.size > 0;
}

// ─── Server ──────────────────────────────────────────────────────────────────

export async function fetchFeedbackSurveyCandidates(): Promise<FeedbackSurvey[]> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return [];
  const { data, error } = await supabase.rpc('get_feedback_surveys_for_me', {
    p_platform: Platform.OS,
    p_app_version: getCurrentAppVersion(),
  });
  if (error || !Array.isArray(data)) return [];
  return (data as FeedbackSurvey[]).filter((s) => Array.isArray(s.questions) && s.questions.length > 0);
}

async function recordSurveyEvent(surveyId: string, event: 'shown' | 'dismissed'): Promise<boolean> {
  const { data, error } = await supabase.rpc('record_feedback_survey_event', {
    p_survey_id: surveyId,
    p_event: event,
  });
  return !error && (data as { ok?: boolean } | null)?.ok === true;
}

export const markFeedbackSurveyShown = (id: string) => recordSurveyEvent(id, 'shown');
export const markFeedbackSurveyDismissed = (id: string) => recordSurveyEvent(id, 'dismissed');

export type SubmitFeedbackResult = { ok: true } | { ok: false; error: string };

export async function submitFeedbackSurvey(
  surveyId: string,
  answers: FeedbackAnswers,
  language: FeedbackLanguage,
): Promise<SubmitFeedbackResult> {
  const { data, error } = await supabase.rpc('submit_feedback_survey_response', {
    p_survey_id: surveyId,
    p_answers: answers,
    p_language: language,
    p_platform: Platform.OS,
    p_app_version: getCurrentAppVersion(),
  });
  if (error) return { ok: false, error: 'network' };
  const res = data as { ok?: boolean; error?: string } | null;
  return res?.ok ? { ok: true } : { ok: false, error: res?.error ?? 'unknown' };
}

// ─── Eligibility ─────────────────────────────────────────────────────────────

/**
 * First survey (in the server's priority order) whose local triggers are met.
 * A survey with an action trigger is only ever picked right after that action,
 * so the popup appears in context rather than on some later app open.
 */
export async function pickFeedbackSurvey(
  candidates: FeedbackSurvey[],
  context: FeedbackCheckContext,
): Promise<FeedbackSurvey | null> {
  const uid = await currentUserId();
  if (!uid || candidates.length === 0) return null;

  return serialized(async () => {
    const counters = await readCounters(uid);
    const baselinesKey = scopedKey(BASELINES_KEY, uid);
    const baselines = await readJson<Record<string, FeedbackCounters>>(baselinesKey, {});
    const { picked, baselines: next, changed } = evaluateFeedbackTriggers(candidates, counters, baselines, context);
    if (changed) await AsyncStorage.setItem(baselinesKey, JSON.stringify(next)).catch(() => {});
    return picked;
  });
}
