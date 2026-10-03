import { supabase } from './supabase';

/** True when this account is a Rencana admin (admin_users, not disabled). Matches DB `is_admin()` for plan changes. */
export async function fetchIsGradeUpAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('disabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.disabled !== true;
}

/**
 * Whether this account's mini-game results belong on the leaderboards.
 *
 * Admins play the games to check levels, not to compete, and an admin who can
 * open any puzzle as often as they like would sit at the top of every board on
 * test scores. So their results stay on their own device and are never posted.
 *
 * Cached per signed-in user: the three games each call this on every result,
 * and the answer cannot change without signing in again.
 */
let adminCache: { userId: string; value: Promise<boolean> } | null = null;

export function isGradeUpAdminCached(userId: string): Promise<boolean> {
  if (adminCache?.userId !== userId) {
    adminCache = { userId, value: fetchIsGradeUpAdmin(userId).catch(() => false) };
  }
  return adminCache.value;
}

/** False for admins, so their scores never reach a leaderboard. */
export async function shouldPostGameScore(userId: string): Promise<boolean> {
  return !(await isGradeUpAdminCached(userId));
}
