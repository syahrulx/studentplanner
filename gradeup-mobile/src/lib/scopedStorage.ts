import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Mini-game progress is cached locally in AsyncStorage. On a shared device several
// people may sign in to the same install, so every local key must be scoped to the
// signed-in user — otherwise one player sees (and overwrites) another's scores.

/** The signed-in user's id, or null when nobody is signed in (guest). */
export async function currentUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Per-user storage key, e.g. `@crossword_progress_v2:<uuid>` (or `:guest`). */
export function scopedKey(base: string, userId: string | null): string {
  return `${base}:${userId ?? 'guest'}`;
}

/**
 * Read a per-user key. There is deliberately NO migration from any legacy
 * un-scoped key: that data can't be reliably attributed to a single account, so
 * inheriting it would leak one user's progress to another. Each account instead
 * starts clean and repopulates from its own remote row (Supabase, keyed by
 * user_id) the next time the game screen syncs.
 */
export async function readScoped(base: string, userId: string | null): Promise<string | null> {
  return AsyncStorage.getItem(scopedKey(base, userId));
}
