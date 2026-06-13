import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { TOTAL_PUZZLES } from './crosswordEngine';
import { currentUserId, scopedKey, readScoped } from './scopedStorage';

// Local + remote persistence for the Crossword mini-game. One Supabase row per
// user (crossword_scores) holding aggregate totals for the leaderboard — fully
// separate from the word game and 2048. The local key is scoped per user so each
// account on a shared device keeps its own completed-puzzle history.

// v2: per-user scoped key. The old un-scoped/shared cache is intentionally
// abandoned so accounts that previously cross-contaminated start clean.
const KEY = '@crossword_progress_v2';

/** Puzzles a player may complete per calendar day. */
export const DAILY_LIMIT = 2;

// Scoring. The base is identical for everyone who completes a puzzle; the streak
// and bonus words are where extra points come from.
export const BASE_POINTS = 100;
export const BONUS_WORD_POINTS = 25;
/** Streak bonus added to every completion: +5 per day on the streak, capped. */
export function streakBonus(streak: number): number {
  return Math.min(Math.max(streak, 0), 7) * 5;
}

export interface CrosswordResult {
  puzzleId: number;
  score: number;
  bonusWords: number;
  hintsUsed: number;
  completedAt: string;
}

export interface CrosswordProgress {
  results: CrosswordResult[];
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string | null;
  /** Calendar date (YYYY-MM-DD) that `playsToday` refers to. */
  playDate: string | null;
  playsToday: number;
}

const EMPTY: CrosswordProgress = {
  results: [],
  currentStreak: 0,
  bestStreak: 0,
  lastPlayedDate: null,
  playDate: null,
  playsToday: 0,
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

export async function loadProgress(): Promise<CrosswordProgress> {
  try {
    const raw = await readScoped(KEY, await currentUserId());
    if (!raw) return { ...EMPTY, results: [] };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<CrosswordProgress>) } as CrosswordProgress;
  } catch {
    return { ...EMPTY, results: [] };
  }
}

export function isCompleted(progress: CrosswordProgress, puzzleId: number): boolean {
  return progress.results.some((r) => r.puzzleId === puzzleId);
}

export function getResult(progress: CrosswordProgress, puzzleId: number): CrosswordResult | undefined {
  return progress.results.find((r) => r.puzzleId === puzzleId);
}

export function getTotalPoints(progress: CrosswordProgress): number {
  return progress.results.reduce((s, r) => s + r.score, 0);
}

export function completedCount(progress: CrosswordProgress): number {
  return progress.results.length;
}

/** How many completions are left today (resets each calendar day). */
export function playsLeftToday(progress: CrosswordProgress): number {
  if (progress.playDate !== todayStr()) return DAILY_LIMIT;
  return Math.max(0, DAILY_LIMIT - progress.playsToday);
}

export function allCompleted(progress: CrosswordProgress): boolean {
  return (progress?.results?.length ?? 0) >= TOTAL_PUZZLES;
}

/** Preview the points a completion would earn (uses the streak it *would* be). */
export function previewPoints(progress: CrosswordProgress, bonusWords: number): number {
  const projectedStreak = projectStreak(progress);
  return BASE_POINTS + bonusWords * BONUS_WORD_POINTS + streakBonus(projectedStreak);
}

function projectStreak(progress: CrosswordProgress): number {
  const today = todayStr();
  if (progress.lastPlayedDate === today) return progress.currentStreak;
  if (progress.lastPlayedDate === yesterdayStr()) return progress.currentStreak + 1;
  return 1;
}

export interface SaveOutcome {
  progress: CrosswordProgress;
  pointsAwarded: number;
  streak: number;
  alreadyDone: boolean;
}

/** Persist a finished crossword, update streak + daily counter + points, sync. */
export async function saveResult(input: {
  puzzleId: number;
  bonusWords: number;
  hintsUsed: number;
}): Promise<SaveOutcome> {
  const userId = await currentUserId();
  const progress = await loadProgress();
  const today = todayStr();

  // Daily streak: increment once per new calendar day with a completion.
  if (progress.lastPlayedDate === today) {
    // already played today, streak unchanged
  } else if (progress.lastPlayedDate === yesterdayStr()) {
    progress.currentStreak += 1;
  } else {
    progress.currentStreak = 1;
  }
  progress.bestStreak = Math.max(progress.bestStreak, progress.currentStreak);
  progress.lastPlayedDate = today;

  const points = BASE_POINTS + input.bonusWords * BONUS_WORD_POINTS + streakBonus(progress.currentStreak);

  const already = isCompleted(progress, input.puzzleId);
  if (!already) {
    progress.results.push({
      puzzleId: input.puzzleId,
      score: points,
      bonusWords: input.bonusWords,
      hintsUsed: input.hintsUsed,
      completedAt: new Date().toISOString(),
    });
  }

  // Daily play counter.
  if (progress.playDate !== today) {
    progress.playDate = today;
    progress.playsToday = 0;
  }
  if (!already) progress.playsToday += 1;

  await AsyncStorage.setItem(scopedKey(KEY, userId), JSON.stringify(progress));
  syncScoreToSupabase(progress).catch(() => {});

  return { progress, pointsAwarded: points, streak: progress.currentStreak, alreadyDone: already };
}

export async function resetProgress(): Promise<void> {
  await AsyncStorage.removeItem(scopedKey(KEY, await currentUserId()));
}

// ---------------------------------------------------------------------------
// Supabase sync & leaderboard
// ---------------------------------------------------------------------------

export async function syncScoreToSupabase(progress: CrosswordProgress): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  const totalPoints = getTotalPoints(progress);
  const completed = completedCount(progress);

  const { data: existing } = await supabase
    .from('crossword_scores')
    .select('total_points, puzzles_completed, best_streak')
    .eq('user_id', userId)
    .maybeSingle();

  const row = {
    user_id: userId,
    total_points: Math.max(totalPoints, existing?.total_points ?? 0),
    puzzles_completed: Math.max(completed, existing?.puzzles_completed ?? 0),
    best_streak: Math.max(progress.bestStreak, existing?.best_streak ?? 0),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('crossword_scores')
    .upsert(row, { onConflict: 'user_id' });
  if (error) console.warn('[crossword] sync upsert failed:', error.message);
}

/** Pull the user's remote aggregate (used to surface their rank/total). */
export async function syncScoresFromSupabase(): Promise<void> {
  // Crossword stores only aggregates remotely, so there is nothing to merge back
  // into the per-puzzle local history. This is a no-op kept for API symmetry.
  return;
}

export interface CrosswordLeaderboardEntry {
  user_id: string;
  name: string;
  avatar_url?: string;
  total_points: number;
  puzzles_completed: number;
  best_streak: number;
  /** True global rank, set only for the current user appended outside the top-N. */
  rank?: number;
}

const GLOBAL_LIMIT = 50;

export async function getCrosswordLeaderboard(
  scope: 'friends' | 'global',
  userId: string,
  friendIds: string[] = [],
): Promise<CrosswordLeaderboardEntry[]> {
  let query = supabase
    .from('crossword_scores')
    .select('user_id, total_points, puzzles_completed, best_streak')
    .order('total_points', { ascending: false })
    .order('puzzles_completed', { ascending: false });

  if (scope === 'friends') {
    query = query.in('user_id', [...friendIds, userId]);
  } else {
    query = query.limit(GLOBAL_LIMIT);
  }

  const { data: rows, error } = await query;
  if (error || !rows || rows.length === 0) {
    if (scope === 'global') return await appendSelf([], userId);
    return [];
  }

  const userIds = rows.map((r: any) => r.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const entries: CrosswordLeaderboardEntry[] = rows.map((r: any) => {
    const profile = profileMap.get(r.user_id);
    return {
      user_id: r.user_id,
      name: profile?.name || 'Player',
      avatar_url: profile?.avatar_url,
      total_points: r.total_points ?? 0,
      puzzles_completed: r.puzzles_completed ?? 0,
      best_streak: r.best_streak ?? 0,
    };
  });

  if (scope !== 'global') return entries;
  return await appendSelf(entries, userId);
}

async function appendSelf(
  entries: CrosswordLeaderboardEntry[],
  userId: string,
): Promise<CrosswordLeaderboardEntry[]> {
  if (entries.some((e) => e.user_id === userId)) return entries;
  const self = await getCrosswordUserRank(userId);
  if (!self || self.total_points <= 0) return entries;

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  return [
    ...entries,
    {
      user_id: userId,
      name: profile?.name || 'You',
      avatar_url: profile?.avatar_url,
      total_points: self.total_points,
      puzzles_completed: self.puzzles_completed,
      best_streak: self.best_streak,
      rank: self.rank,
    },
  ];
}

export async function getCrosswordUserRank(userId: string): Promise<{
  total_points: number;
  puzzles_completed: number;
  best_streak: number;
  rank: number;
} | null> {
  const { data: mine } = await supabase
    .from('crossword_scores')
    .select('total_points, puzzles_completed, best_streak')
    .eq('user_id', userId)
    .maybeSingle();
  if (!mine) return null;

  const { count: ahead } = await supabase
    .from('crossword_scores')
    .select('user_id', { count: 'exact', head: true })
    .gt('total_points', mine.total_points);

  return {
    total_points: mine.total_points ?? 0,
    puzzles_completed: mine.puzzles_completed ?? 0,
    best_streak: mine.best_streak ?? 0,
    rank: (ahead ?? 0) + 1,
  };
}
