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

export async function resetProgress(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
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
export async function syncScoreToSupabase(result: PuzzleResult): Promise<void> {
  console.log('[sync] Starting sync for puzzle', result.puzzleId);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    console.log('[sync] No user session found');
    return;
  }

  const userId = session.user.id;
  console.log('[sync] User ID:', userId);

  // Upsert: only overwrite if the new score is higher
  const { data: existing, error: existingErr } = await supabase
    .from('word_game_scores')
    .select('score')
    .eq('user_id', userId)
    .eq('puzzle_id', result.puzzleId)
    .maybeSingle();

  if (existingErr) {
    console.error('Error fetching existing score:', existingErr.message);
  }

  if (existing && existing.score >= result.score) {
    console.log('[sync] Existing score is higher, skipping upsert');
    return;
  }

  console.log('[sync] Upserting score...', result.score);
  const { data: upsertData, error: upsertErr } = await supabase
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
    )
    .select();

  if (upsertErr) {
    console.error('[sync] Error upserting score:', upsertErr.message);
  } else {
    console.log('[sync] Upsert successful!', upsertData);
  }
}

/** Fetch the user's scores from Supabase and merge them into local storage. */
export async function syncScoresFromSupabase(): Promise<ConnectionsProgress | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return null;

    const { data: remoteScores, error } = await supabase
      .from('word_game_scores')
      .select('puzzle_id, score, mistakes, time_ms, updated_at')
      .eq('user_id', session.user.id);

    if (error || !remoteScores) {
      console.error('[sync] Error fetching remote scores:', error?.message);
      return null;
    }

    if (remoteScores.length === 0) return null;

    const localProgress = await loadProgress();
    let updated = false;

    for (const remote of remoteScores) {
      const existingIdx = localProgress.results.findIndex(r => r.puzzleId === remote.puzzle_id);
      if (existingIdx >= 0) {
        if (remote.score > localProgress.results[existingIdx].score) {
          localProgress.results[existingIdx] = {
            puzzleId: remote.puzzle_id,
            score: remote.score,
            mistakes: remote.mistakes,
            timeMs: remote.time_ms,
            completedAt: remote.updated_at,
          };
          updated = true;
        }
      } else {
        localProgress.results.push({
          puzzleId: remote.puzzle_id,
          score: remote.score,
          mistakes: remote.mistakes,
          timeMs: remote.time_ms,
          completedAt: remote.updated_at,
        });
        updated = true;
      }
    }

    if (updated) {
      await AsyncStorage.setItem(KEY, JSON.stringify(localProgress));
      console.log(`[sync] Merged ${remoteScores.length} remote scores into local storage.`);
    }
    
    return localProgress;
  } catch (err) {
    console.error('[sync] Sync from Supabase failed', err);
    return null;
  }
}

/** Leaderboard entry shape */
export interface GameLeaderboardEntry {
  user_id: string;
  name: string;
  avatar_url?: string;
  total_score: number;
  puzzles_solved: number;
  // True global rank (1-based). Set only for the current user when appended
  // outside the displayed top-N. Undefined for normal list rows.
  rank?: number;
}

const GLOBAL_GAME_LEADERBOARD_LIMIT = 50;

// Fully paginate word_game_scores and aggregate per user. Fallback for when the
// server-side RPC isn't available. Reads ALL matching rows so global totals are
// complete (not truncated to 5000) and consistent with the friends scope.
async function aggregateGameClientSide(
  scope: 'friends' | 'global',
  userId: string,
  friendIds: string[],
): Promise<Map<string, { total_score: number; puzzles_solved: number }>> {
  const userMap = new Map<string, { total_score: number; puzzles_solved: number }>();
  const pageSize = 1000;
  const HARD_CAP = 50000;
  let from = 0;

  while (from < HARD_CAP) {
    let query = supabase
      .from('word_game_scores')
      .select('user_id, score')
      .order('updated_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (scope === 'friends') query = query.in('user_id', [...friendIds, userId]);

    const { data, error } = await query;
    if (error || !data || data.length === 0) break;

    for (const s of data) {
      const entry = userMap.get(s.user_id) || { total_score: 0, puzzles_solved: 0 };
      entry.total_score += s.score;
      entry.puzzles_solved += 1;
      userMap.set(s.user_id, entry);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return userMap;
}

/** Fetch the word game leaderboard (friends or global). */
export async function getGameLeaderboard(
  scope: 'friends' | 'global',
  userId: string,
  friendIds: string[] = [],
): Promise<GameLeaderboardEntry[]> {
  const userMap = new Map<string, { total_score: number; puzzles_solved: number }>();

  // Preferred path: server-side SUM(score) GROUP BY user_id (complete + cheap).
  let agg: any[] | null = null;
  try {
    const { data, error } = await supabase.rpc('get_word_game_leaderboard', {
      p_user_ids: scope === 'friends' ? [...friendIds, userId] : null,
      p_limit: scope === 'global' ? GLOBAL_GAME_LEADERBOARD_LIMIT : null,
    });
    if (!error && Array.isArray(data)) agg = data;
  } catch {
    agg = null;
  }

  if (agg) {
    for (const r of agg) {
      userMap.set(r.user_id, {
        total_score: Number(r.total_score) || 0,
        puzzles_solved: Number(r.puzzles_solved) || 0,
      });
    }
  } else {
    const fallback = await aggregateGameClientSide(scope, userId, friendIds);
    for (const [uid, stats] of fallback) userMap.set(uid, stats);
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

  if (scope !== 'global') return entries;

  const top = entries.slice(0, GLOBAL_GAME_LEADERBOARD_LIMIT);
  if (!top.some((e) => e.user_id === userId)) {
    const self = await getGameUserRank(userId);
    if (self && self.total_score > 0) {
      const profile = profileMap.get(userId);
      top.push({
        user_id: userId,
        name: profile?.name || 'You',
        avatar_url: profile?.avatar_url,
        total_score: self.total_score,
        puzzles_solved: self.puzzles_solved,
        rank: self.rank,
      });
    }
  }
  return top;
}

// Current user's global word-game total + true rank. RPC when available, else
// full client-side aggregation fallback.
async function getGameUserRank(
  userId: string,
): Promise<{ total_score: number; puzzles_solved: number; rank: number } | null> {
  try {
    const { data, error } = await supabase.rpc('get_word_game_user_rank', {
      p_user_id: userId,
    });
    if (!error && Array.isArray(data) && data[0]) {
      const r = data[0] as any;
      return {
        total_score: Number(r.total_score) || 0,
        puzzles_solved: Number(r.puzzles_solved) || 0,
        rank: Number(r.rank) || 0,
      };
    }
  } catch {
    // fall through to client-side fallback
  }

  const map = await aggregateGameClientSide('global', userId, []);
  const sorted = Array.from(map.entries()).sort((a, b) => b[1].total_score - a[1].total_score);
  const idx = sorted.findIndex(([uid]) => uid === userId);
  if (idx === -1) return null;
  const stats = sorted[idx][1];
  return { total_score: stats.total_score, puzzles_solved: stats.puzzles_solved, rank: idx + 1 };
}
