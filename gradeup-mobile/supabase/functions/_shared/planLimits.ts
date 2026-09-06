/**
 * Plan-based feature limits shared by all AI Edge Functions.
 *
 * The mobile client mirrors these numbers in
 * `src/lib/flashcardGenerationLimits.ts`. Both files carry the same table so a
 * change here must be copied there (the client cannot import Deno modules).
 */

export type Plan = 'free' | 'plus' | 'pro';

export function normalizePlan(plan: string | null | undefined): Plan {
  const p = (plan ?? 'free').toLowerCase();
  return p === 'pro' || p === 'plus' ? p : 'free';
}

/** Max AI generation requests per UTC day (flashcards + quiz + chat + extraction). */
export const DAILY_GENERATION_LIMITS: Record<Plan, number> = {
  free: 20,
  plus: 100,
  pro: 500,
};

/** Max flashcards a single generation request may return. */
export const FLASHCARD_MAX_PER_REQUEST: Record<Plan, number> = {
  free: 10,
  plus: 20,
  pro: 35,
};

/** Default card count when the client sends none. */
export const FLASHCARD_DEFAULT_COUNT: Record<Plan, number> = {
  free: 8,
  plus: 15,
  pro: 25,
};

/** Max quiz questions per request. */
export const QUIZ_MAX_QUESTIONS: Record<Plan, number> = {
  free: 20,
  plus: 20,
  pro: 30,
};

/** Image (vision) chat messages allowed per window. */
export const VISION_LIMITS: Record<Plan, { count: number; windowDays: number } | null> = {
  free: { count: 1, windowDays: 3 },
  plus: { count: 3, windowDays: 1 },
  pro: null, // unlimited
};

/** Chat context budget in characters sent to the model per turn. */
export const CHAT_CONTEXT_CHAR_LIMITS: Record<Plan, number> = {
  free: 60_000,
  plus: 120_000,
  pro: 240_000,
};

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
