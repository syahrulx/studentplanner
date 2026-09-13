import type { SubscriptionPlan } from '../types';

// ---------------------------------------------------------------------------
// Flashcard generation caps.
//
// These MIRROR the server-side values in supabase/functions/_shared/planLimits.ts
// (the Edge Function clamps `count` to the same caps and picks the same
// defaults). Change both files together.
//   caps:     free 10 / plus 20 / pro 35
//   defaults: free  8 / plus 15 / pro 25
// ---------------------------------------------------------------------------

/** Max flashcards per generation for Free tier (mirrors planLimits.ts). */
export const FLASHCARD_GEN_FREE_MAX = 10;

/** Max flashcards per generation for Plus tier (mirrors planLimits.ts). */
export const FLASHCARD_GEN_PLUS_MAX = 20;

/** Max flashcards per generation for Pro tier (mirrors planLimits.ts). */
export const FLASHCARD_GEN_PRO_MAX = 35;

/** Default card count per generation, by plan (mirrors planLimits.ts). */
export const FLASHCARD_GEN_FREE_DEFAULT = 8;
export const FLASHCARD_GEN_PLUS_DEFAULT = 15;
export const FLASHCARD_GEN_PRO_DEFAULT = 25;

/** Always shown in the picker; selection is locked above the user's plan max. */
export const FLASHCARD_GEN_ALL_OPTIONS = [5, 10, 15, 20, 25, 30, 35] as const;

export function isAtLeastPlus(plan?: SubscriptionPlan | null): boolean {
  return plan === 'plus' || plan === 'pro';
}

export function isPro(plan?: SubscriptionPlan | null): boolean {
  return plan === 'pro';
}

export function maxFlashcardsForPlan(plan?: SubscriptionPlan | null): number {
  if (isPro(plan)) return FLASHCARD_GEN_PRO_MAX;
  if (isAtLeastPlus(plan)) return FLASHCARD_GEN_PLUS_MAX;
  return FLASHCARD_GEN_FREE_MAX;
}

export function defaultFlashcardCountForPlan(plan?: SubscriptionPlan | null): number {
  if (isPro(plan)) return FLASHCARD_GEN_PRO_DEFAULT;
  if (isAtLeastPlus(plan)) return FLASHCARD_GEN_PLUS_DEFAULT;
  return FLASHCARD_GEN_FREE_DEFAULT;
}

export function clampFlashcardCountForPlan(count: number, plan?: SubscriptionPlan | null): number {
  const max = maxFlashcardsForPlan(plan);
  return Math.min(Math.max(1, Math.round(count)), max);
}

// =============================================================================
// Study Snap Limits
// =============================================================================

/** Max snaps a user can post per day. Pro = Infinity (no limit). */
export function maxSnapsPerDay(plan?: SubscriptionPlan | null): number {
  if (isPro(plan)) return Infinity;
  if (isAtLeastPlus(plan)) return 3;
  return 1;
}

/** Max friend snaps a Free user can view per day (Plus/Pro = unlimited). */
export const SNAP_VIEW_LIMIT_FREE = 3;

/** Max streak revivals per month, by plan. */
export function maxStreakRevivals(plan?: SubscriptionPlan | null): number {
  if (isPro(plan)) return 3;
  if (isAtLeastPlus(plan)) return 2;
  return 1;
}

/** Number of days of snap history visible, by plan. Pro = Infinity. */
export function snapHistoryDays(plan?: SubscriptionPlan | null): number {
  if (isPro(plan)) return Infinity;
  if (isAtLeastPlus(plan)) return 7;
  return 0; // Free: no history
}
