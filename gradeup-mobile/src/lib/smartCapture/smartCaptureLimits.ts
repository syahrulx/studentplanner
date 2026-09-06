import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SubscriptionPlan } from '../../types';
import { isAtLeastPlus } from '../flashcardGenerationLimits';

// ---------------------------------------------------------------------------
// Smart Capture caps.
//
// MIRRORS supabase/functions/_shared/planLimits.ts → SMART_CAPTURE_DAILY_LIMITS
// (the Edge Function is the source of truth and rejects with
// code `SMART_CAPTURE_LIMIT`). Change both files together.
//   free 2 per UTC day / plus unlimited / pro unlimited
// ---------------------------------------------------------------------------

/** Smart Captures a Free user may run per day. */
export const SMART_CAPTURE_FREE_PER_DAY = 2;

export function smartCaptureLimitForPlan(plan?: SubscriptionPlan | null): number {
  return isAtLeastPlus(plan) ? Infinity : SMART_CAPTURE_FREE_PER_DAY;
}

/**
 * Local counter. Only used to render "1 of 2 free today" before a request is
 * made — the server still enforces the real limit, and the two can differ if
 * the user switches devices mid-day.
 */
function keyForToday(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `smart_capture_uses:${y}-${m}-${d}`;
}

export async function getUsesToday(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(keyForToday());
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export async function recordUse(): Promise<number> {
  try {
    const next = (await getUsesToday()) + 1;
    await AsyncStorage.setItem(keyForToday(), String(next));
    return next;
  } catch {
    return 0;
  }
}

/** Remaining free captures, or `null` when the plan is unlimited. */
export function remainingFreeCaptures(
  plan: SubscriptionPlan | null | undefined,
  usedToday: number,
): number | null {
  const limit = smartCaptureLimitForPlan(plan);
  if (!Number.isFinite(limit)) return null;
  return Math.max(0, limit - usedToday);
}
