import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * One read of the signed-in user's `profiles` row, shared by everything that
 * needs part of it during boot.
 *
 * Five separate readers used to hit this row on every cold start — both layout
 * gates for `university`, profileDb for the full row, the community context for
 * `location_visibility`, and the subscription refresh for the billing columns.
 * Five round trips for one row, and that row is also where `last_active_at` and
 * the push token are written, so it is the busiest row the app touches.
 *
 * Two mechanisms, deliberately both:
 *  - in-flight coalescing, so readers that overlap share one request;
 *  - a short freshness window, because boot readers start milliseconds apart
 *    rather than simultaneously and would otherwise miss each other.
 *
 * Only successful reads are cached. A failure is never stored, so a caller that
 * retries genuinely retries instead of being handed the same failure.
 */

/** The union of every column a cached reader needs. */
const PROFILE_COLUMNS =
  'id, name, university, university_id, academic_level, student_id, program, part, ' +
  'avatar_url, campus, faculty, study_mode, current_semester, hea_term_code, ' +
  'mystudent_email, last_sync, portal_teaching_anchored_semester, subscription_plan, ' +
  'subscription_status, subscription_period_type, subscription_expires_at, ' +
  'has_used_theme_trial, theme_preferences, country, location_visibility';

/**
 * Long enough to cover the spread between boot readers, short enough that a
 * server-side change is not hidden for any meaningful time. Anything that must
 * not read stale — the subscription refresh after a purchase — passes `force`.
 */
const FRESH_WINDOW_MS = 15_000;

export type ProfileRowRaw = Record<string, unknown>;

export type ProfileFetchResult = {
  /** Null means the row genuinely does not exist, but only when `error` is null. */
  row: ProfileRowRaw | null;
  error: PostgrestError | Error | null;
};

let cached: { userId: string; row: ProfileRowRaw | null; at: number } | null = null;
let inFlight: { userId: string; promise: Promise<ProfileFetchResult> } | null = null;

async function readProfileRow(userId: string): Promise<ProfileFetchResult> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      // maybeSingle, not single: a missing row is a real state for a user who
      // has signed up but not finished onboarding, and callers need to tell it
      // apart from a request that failed.
      .maybeSingle();

    if (error) return { row: null, error };
    const row = (data as ProfileRowRaw | null) ?? null;
    cached = { userId, row, at: Date.now() };
    return { row, error: null };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * The signed-in user's profile row.
 *
 * Pass `force` when a stale read would be wrong — after a purchase, or any
 * time the caller is specifically checking for a server-side change.
 */
export function fetchProfileRow(
  userId: string,
  opts?: { force?: boolean },
): Promise<ProfileFetchResult> {
  if (!userId) return Promise.resolve({ row: null, error: new Error('Missing user id') });

  if (!opts?.force) {
    if (cached && cached.userId === userId && Date.now() - cached.at < FRESH_WINDOW_MS) {
      return Promise.resolve({ row: cached.row, error: null });
    }
    if (inFlight && inFlight.userId === userId) return inFlight.promise;
  }

  const promise = readProfileRow(userId).finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  inFlight = { userId, promise };
  return promise;
}

/**
 * Drops the cached row. Called after our own writes so the next reader sees
 * them, and on sign-out so one account never serves another's data.
 */
export function invalidateProfileCache(userId?: string): void {
  if (!userId || cached?.userId === userId) cached = null;
  if (!userId || inFlight?.userId === userId) inFlight = null;
}
