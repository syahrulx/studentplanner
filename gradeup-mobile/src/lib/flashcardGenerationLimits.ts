import type { SubscriptionPlan } from '../types';

/** Max flashcards per generation for Free tier (must match Edge Function). */
export const FLASHCARD_GEN_FREE_MAX = 10;

/** Max flashcards per generation for Plus tier (must match Edge Function). */
export const FLASHCARD_GEN_PLUS_MAX = 20;

/** Max flashcards per generation for Pro tier (must match Edge Function). */
export const FLASHCARD_GEN_PRO_MAX = 35;

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
  if (isPro(plan)) return 25;
  if (isAtLeastPlus(plan)) return 15;
  return 8;
}

export function clampFlashcardCountForPlan(count: number, plan?: SubscriptionPlan | null): number {
  const max = maxFlashcardsForPlan(plan);
  return Math.min(Math.max(1, Math.round(count)), max);
}
