import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Local + remote persistence for the 2048 minigame. Mirrors connectionsStorage.ts
// but lives in its own AsyncStorage key and Supabase table (game_2048_scores) so
// it is completely separate from the word game.

const KEY = '@game2048_progress';

export interface Game2048Progress {
  /** Highest single-game score ever. */
  bestScore: number;
  /** Highest tile value ever reached. */
  bestTile: number;
  /** Lifetime Rencana Points earned from this game. */
  totalPoints: number;
  gamesPlayed: number;
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string | null;
}

const EMPTY: Game2048Progress = {
  bestScore: 0,
  bestTile: 0,
  totalPoints: 0,
  gamesPlayed: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastPlayedDate: null,
};

// Rencana Points awarded per finished game, based on the highest tile reached.
// A game awards the single tier matching its best tile (reaching 512 grants 20).
const POINT_TIERS: { tile: number; points: number }[] = [
  { tile: 2048, points: 100 },
  { tile: 1024, points: 50 },
  { tile: 512, points: 20 },
  { tile: 256, points: 10 },
  { tile: 128, points: 5 },
];

/** Rencana Points for a game whose highest tile was `bestTile` (0 below 128). */
export function pointsForTile(bestTile: number): number {
  for (const tier of POINT_TIERS) {
    if (bestTile >= tier.tile) return tier.points;
  }
  return 0;
}

export async function loadProgress(): Promise<Game2048Progress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Game2048Progress>) };
  } catch {
    return { ...EMPTY };
  }
}

export interface Game2048Result {
  score: number;
  bestTile: number;
  moves: number;
  won: boolean;
}

/** Persist a finished game, update bests/streak/points, and sync to Supabase. */
export async function saveGameResult(
  result: Game2048Result,
): Promise<{ progress: Game2048Progress; pointsAwarded: number }> {
  const progress = await loadProgress();
  const pointsAwarded = pointsForTile(result.bestTile);

  progress.bestScore = Math.max(progress.bestScore, result.score);
  progress.bestTile = Math.max(progress.bestTile, result.bestTile);
  progress.totalPoints += pointsAwarded;
  progress.gamesPlayed += 1;

  // Daily streak (one increment per new calendar day played).
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (progress.lastPlayedDate === yesterday) {
    progress.currentStreak += 1;
  } else if (progress.lastPlayedDate !== today) {
    progress.currentStreak = 1;
  }
  progress.bestStreak = Math.max(progress.bestStreak, progress.currentStreak);
  progress.lastPlayedDate = today;

  await AsyncStorage.setItem(KEY, JSON.stringify(progress));
  syncScoreToSupabase(progress).catch(() => {});

  return { progress, pointsAwarded };
}

export async function resetProgress(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// ---------------------------------------------------------------------------
// Supabase sync & leaderboard
// ---------------------------------------------------------------------------

/** Upsert the user's single best-scores row (keeps the higher values). */
export async function syncScoreToSupabase(progress: Game2048Progress): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  const { data: existing } = await supabase
    .from('game_2048_scores')
    .select('best_score, best_tile, total_points, games_played')
    .eq('user_id', userId)
    .maybeSingle();

  const row = {
    user_id: userId,
    best_score: Math.max(progress.bestScore, existing?.best_score ?? 0),
    best_tile: Math.max(progress.bestTile, existing?.best_tile ?? 0),
    total_points: Math.max(progress.totalPoints, existing?.total_points ?? 0),
    games_played: Math.max(progress.gamesPlayed, existing?.games_played ?? 0),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('game_2048_scores')
    .upsert(row, { onConflict: 'user_id' });
  if (error) console.warn('[2048] sync upsert failed:', error.message);
}

/** Pull the user's remote row and merge the higher values into local storage. */
export async function syncScoresFromSupabase(): Promise<Game2048Progress | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return null;

    const { data: remote, error } = await supabase
      .from('game_2048_scores')
      .select('best_score, best_tile, total_points, games_played')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !remote) return null;

    const local = await loadProgress();
    const merged: Game2048Progress = {
      ...local,
      bestScore: Math.max(local.bestScore, remote.best_score ?? 0),
      bestTile: Math.max(local.bestTile, remote.best_tile ?? 0),
      totalPoints: Math.max(local.totalPoints, remote.total_points ?? 0),
      gamesPlayed: Math.max(local.gamesPlayed, remote.games_played ?? 0),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return null;
  }
}

export interface Game2048LeaderboardEntry {
  user_id: string;
  name: string;
  avatar_url?: string;
  best_tile: number;
  best_score: number;
  total_points: number;
  games_played: number;
  /** True global rank, set only for the current user appended outside the top-N. */
  rank?: number;
}

const GLOBAL_LIMIT = 50;

/**
 * Fetch the 2048 leaderboard. One row per user means no aggregation is needed —
 * we simply order by best tile, then best score as the tiebreaker.
 */
export async function getGame2048Leaderboard(
  scope: 'friends' | 'global',
  userId: string,
  friendIds: string[] = [],
): Promise<Game2048LeaderboardEntry[]> {
  let query = supabase
    .from('game_2048_scores')
    .select('user_id, best_tile, best_score, total_points, games_played')
    .order('best_tile', { ascending: false })
    .order('best_score', { ascending: false });

  if (scope === 'friends') {
    query = query.in('user_id', [...friendIds, userId]);
  } else {
    query = query.limit(GLOBAL_LIMIT);
  }

  const { data: rows, error } = await query;
  if (error || !rows || rows.length === 0) {
    // Even with no leaderboard rows yet, still surface the user's own card on global.
    if (scope === 'global') return await appendSelf([], userId, friendIds);
    return [];
  }

  const userIds = rows.map((r: any) => r.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const entries: Game2048LeaderboardEntry[] = rows.map((r: any) => {
    const profile = profileMap.get(r.user_id);
    return {
      user_id: r.user_id,
      name: profile?.name || 'Player',
      avatar_url: profile?.avatar_url,
      best_tile: r.best_tile ?? 0,
      best_score: r.best_score ?? 0,
      total_points: r.total_points ?? 0,
      games_played: r.games_played ?? 0,
    };
  });

  if (scope !== 'global') return entries;
  return await appendSelf(entries, userId, friendIds);
}

// Ensure the current user's own row + true rank is present on the global board.
async function appendSelf(
  entries: Game2048LeaderboardEntry[],
  userId: string,
  _friendIds: string[],
): Promise<Game2048LeaderboardEntry[]> {
  if (entries.some((e) => e.user_id === userId)) return entries;
  const self = await getGame2048UserRank(userId);
  if (!self || self.best_tile <= 0) return entries;

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
      best_tile: self.best_tile,
      best_score: self.best_score,
      total_points: self.total_points,
      games_played: self.games_played,
      rank: self.rank,
    },
  ];
}

/** The current user's global rank (ties on tile broken by best score). */
export async function getGame2048UserRank(userId: string): Promise<{
  best_tile: number;
  best_score: number;
  total_points: number;
  games_played: number;
  rank: number;
} | null> {
  const { data: mine } = await supabase
    .from('game_2048_scores')
    .select('best_tile, best_score, total_points, games_played')
    .eq('user_id', userId)
    .maybeSingle();
  if (!mine) return null;

  // Count users strictly ahead: higher tile, or equal tile with a higher score.
  const { count: higherTile } = await supabase
    .from('game_2048_scores')
    .select('user_id', { count: 'exact', head: true })
    .gt('best_tile', mine.best_tile);
  const { count: sameTileHigherScore } = await supabase
    .from('game_2048_scores')
    .select('user_id', { count: 'exact', head: true })
    .eq('best_tile', mine.best_tile)
    .gt('best_score', mine.best_score);

  const rank = (higherTile ?? 0) + (sameTileHigherScore ?? 0) + 1;
  return {
    best_tile: mine.best_tile ?? 0,
    best_score: mine.best_score ?? 0,
    total_points: mine.total_points ?? 0,
    games_played: mine.games_played ?? 0,
    rank,
  };
}
