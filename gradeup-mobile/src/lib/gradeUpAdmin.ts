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
 * The one account the mini-games treat as a test account.
 *
 * Deliberately a single id rather than "any admin". Admins are real students
 * too, and several of them compete on these boards; taking the whole table out
 * of the rankings to solve one person's test scores would have been a bigger
 * change than the problem. Izwan asked for his account only.
 *
 * It buys two things, both for checking levels rather than winning: the
 * crossword's two-a-day drip and in-order unlock are lifted, and no result
 * from this account is ever posted to a leaderboard. The second is also what
 * makes clearing the stored scores stick — syncScoreToSupabase writes
 * `Math.max(new, existing)` and never lowers a total, so a reset in the
 * database used to be undone by the next sync from the device.
 */
const GAME_TEST_ACCOUNT_ID = 'a44b03d4-3ab8-47f5-91cf-f88720fcb204';

export function isGameTestAccount(userId: string | null | undefined): boolean {
  return !!userId && userId === GAME_TEST_ACCOUNT_ID;
}

/** False for the test account, so its scores never reach a leaderboard. */
export async function shouldPostGameScore(userId: string): Promise<boolean> {
  return !isGameTestAccount(userId);
}
