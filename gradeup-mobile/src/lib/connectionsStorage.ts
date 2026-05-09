import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const KEY = '@connections_progress';

export interface PuzzleResult {
  puzzleId: number;
  score: number;
  mistakes: number;
  timeMs: number;
  completedAt: string;
}

export interface ConnectionsProgress {
  results: PuzzleResult[];
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string | null;
}

const EMPTY: ConnectionsProgress = {
  results: [],
  currentStreak: 0,
  bestStreak: 0,
  lastPlayedDate: null,
};

export async function loadProgress(): Promise<ConnectionsProgress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, results: [] };
    return JSON.parse(raw) as ConnectionsProgress;
  } catch {
    return { ...EMPTY, results: [] };
  }
}

export async function saveResult(result: PuzzleResult): Promise<ConnectionsProgress> {
  const progress = await loadProgress();
  // Don't save duplicate — keep best score
  const existing = progress.results.findIndex((r) => r.puzzleId === result.puzzleId);
  if (existing >= 0) {
    if (result.score > progress.results[existing].score) {
      progress.results[existing] = result;
    }
  } else {
    progress.results.push(result);
  }

  // Update streak
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (progress.lastPlayedDate === yesterday || progress.lastPlayedDate === today) {
    if (progress.lastPlayedDate !== today) {
      progress.currentStreak += 1;
    }
  } else {
    progress.currentStreak = 1;
  }
  progress.bestStreak = Math.max(progress.bestStreak, progress.currentStreak);
  progress.lastPlayedDate = today;

  await AsyncStorage.setItem(KEY, JSON.stringify(progress));

  // Sync to Supabase for leaderboard (fire-and-forget)
  syncScoreToSupabase(result).catch(() => {});

  return progress;
}

export function calculateScore(mistakes: number, timeMs: number): number {
  const base = mistakes === 0 ? 250 : Math.max(50, 250 - mistakes * 50);
  const timeBonus = Math.max(0, 50 - Math.floor(timeMs / 2000));
  return base + timeBonus;
}

export function getBestResult(progress: ConnectionsProgress, puzzleId: number): PuzzleResult | undefined {
  return progress.results.find((r) => r.puzzleId === puzzleId);
}

export function getTotalScore(progress: ConnectionsProgress): number {
  return progress.results.reduce((sum, r) => sum + r.score, 0);
}

// ---------------------------------------------------------------------------
// Supabase sync & leaderboard
// ---------------------------------------------------------------------------

/** Upsert the user's score for a puzzle to Supabase (keeps the best). */
async function syncScoreToSupabase(result: PuzzleResult): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return;

  const userId = session.user.id;

  // Upsert: only overwrite if the new score is higher
  const { data: existing } = await supabase
    .from('word_game_scores')
    .select('score')
    .eq('user_id', userId)
    .eq('puzzle_id', result.puzzleId)
    .maybeSingle();

  if (existing && existing.score >= result.score) return;

  await supabase
    .from('word_game_scores')
    .upsert(
      {
        user_id: userId,
        puzzle_id: result.puzzleId,
        score: result.score,
        mistakes: result.mistakes,
        time_ms: result.timeMs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,puzzle_id' },
    );
}

/** Leaderboard entry shape */
export interface GameLeaderboardEntry {
  user_id: string;
  name: string;
  avatar_url?: string;
  total_score: number;
  puzzles_solved: number;
}

/** Fetch the word game leaderboard (friends or global). */
export async function getGameLeaderboard(
  scope: 'friends' | 'global',
  userId: string,
  friendIds: string[] = [],
): Promise<GameLeaderboardEntry[]> {
  // Fetch scores
  let query = supabase
    .from('word_game_scores')
    .select('user_id, score')
    .order('updated_at', { ascending: false })
    .limit(5000);

  if (scope === 'friends') {
    query = query.in('user_id', [...friendIds, userId]);
  }

  const { data: scores, error } = await query;
  if (error || !scores) return [];

  // Aggregate per user
  const userMap = new Map<string, { total_score: number; puzzles_solved: number }>();
  for (const s of scores) {
    const entry = userMap.get(s.user_id) || { total_score: 0, puzzles_solved: 0 };
    entry.total_score += s.score;
    entry.puzzles_solved += 1;
    userMap.set(s.user_id, entry);
  }

  const userIds = Array.from(userMap.keys());
  if (userIds.length === 0) return [];

  // Fetch profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const entries: GameLeaderboardEntry[] = userIds.map((uid) => {
    const stats = userMap.get(uid)!;
    const profile = profileMap.get(uid);
    return {
      user_id: uid,
      name: profile?.name || 'Player',
      avatar_url: profile?.avatar_url,
      total_score: stats.total_score,
      puzzles_solved: stats.puzzles_solved,
    };
  });

  entries.sort((a, b) => b.total_score - a.total_score);
  return scope === 'global' ? entries.slice(0, 50) : entries;
}
