import AsyncStorage from '@react-native-async-storage/async-storage';

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
