import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { captureError } from './monitoring';

/**
 * Pinned tasks and "study done" ticks, kept in step across devices through
 * public.user_planner_state.
 *
 * Each list is replaced whole, and the newest change wins: a pin removed on
 * the phone stays removed on the iPad, which a merge would undo. The phone
 * still keeps its own copy (storage.ts) so everything works offline; a change
 * that could not reach the server is marked `dirty` and sent on the next load.
 *
 * A local copy only counts for the account that made it (`userId`), so a
 * second account signing in on the same phone never inherits or uploads the
 * first one's pins.
 */

export type PlannerField = 'pinned' | 'completed';

type LocalMeta = { userId: string | null; updatedAt: string | null; dirty: boolean };

const META_KEYS: Record<PlannerField, string> = {
  pinned: 'pinnedTaskIdsSyncMeta',
  completed: 'completedStudyKeysSyncMeta',
};

const COLUMNS: Record<PlannerField, { list: string; at: string }> = {
  pinned: { list: 'pinned_task_ids', at: 'pinned_updated_at' },
  completed: { list: 'completed_study_keys', at: 'completed_updated_at' },
};

/** Ticks older than this are not worth carrying around. Keys are "YYYY-MM-DDTHH:mm". */
const COMPLETED_KEEP_DAYS = 60;

export function pruneCompletedKeys(keys: string[], now = new Date()): string[] {
  const cutoff = new Date(now.getTime() - COMPLETED_KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  return keys.filter((k) => k.slice(0, 10) >= cutoff).slice(-1000);
}

async function readMeta(field: PlannerField): Promise<LocalMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(META_KEYS[field]);
    return raw ? (JSON.parse(raw) as LocalMeta) : null;
  } catch {
    return null;
  }
}

async function writeMeta(field: PlannerField, meta: LocalMeta): Promise<void> {
  try {
    await AsyncStorage.setItem(META_KEYS[field], JSON.stringify(meta));
  } catch {
    /* best effort: the next change rewrites it */
  }
}

/** The table is not migrated yet (Postgres or PostgREST wording): stay local-only, quietly. */
function tableMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST205';
}

async function push(userId: string, field: PlannerField, list: string[], at: string): Promise<boolean> {
  const c = COLUMNS[field];
  const { error } = await supabase
    .from('user_planner_state')
    .upsert({ user_id: userId, [c.list]: list, [c.at]: at }, { onConflict: 'user_id' });
  if (error) {
    if (!tableMissing(error)) captureError(error, { where: `plannerStateSync.push.${field}` });
    return false;
  }
  return true;
}

/**
 * Call after every local change. Marks the change, then tries to send it;
 * if that fails it is sent on the next load instead.
 */
export async function recordLocalChange(userId: string | null | undefined, field: PlannerField, list: string[]): Promise<void> {
  const at = new Date().toISOString();
  const uid = userId?.trim() || null;
  await writeMeta(field, { userId: uid, updatedAt: at, dirty: true });
  if (!uid) return;
  const value = field === 'completed' ? pruneCompletedKeys(list) : list;
  if (await push(uid, field, value, at)) {
    await writeMeta(field, { userId: uid, updatedAt: at, dirty: false });
  }
}

/**
 * Reconcile both lists for a signed-in student. Returns the lists the phone
 * should now show; a list is missing only when the server could not be read.
 */
export async function reconcilePlannerState(
  userId: string,
  local: { pinned: string[]; completed: string[] },
): Promise<{ pinned?: string[]; completed?: string[] }> {
  const { data, error } = await supabase
    .from('user_planner_state')
    .select('pinned_task_ids, pinned_updated_at, completed_study_keys, completed_updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (!tableMissing(error)) captureError(error, { where: 'plannerStateSync.reconcile' });
    return {};
  }
  const row = (data ?? null) as Record<string, unknown> | null;
  const out: { pinned?: string[]; completed?: string[] } = {};

  for (const field of ['pinned', 'completed'] as const) {
    const c = COLUMNS[field];
    const remoteList = Array.isArray(row?.[c.list]) ? (row![c.list] as string[]) : [];
    const remoteAt = typeof row?.[c.at] === 'string' ? (row![c.at] as string) : null;
    const meta = await readMeta(field);
    // A copy made by another account, or before this sync existed on a phone
    // that has since switched accounts, is not this student's.
    const mine = !meta || meta.userId === userId || meta.userId === null;
    const localList = mine ? local[field] : [];
    const localAt = mine ? meta?.updatedAt ?? null : null;

    const localNewer = !!localAt && (!remoteAt || Date.parse(localAt) > Date.parse(remoteAt));
    if (!remoteAt) {
      // Nothing on the server yet: the first device to sync uploads what it has.
      if (localList.length > 0) {
        const at = localAt ?? new Date().toISOString();
        const value = field === 'completed' ? pruneCompletedKeys(localList) : localList;
        if (await push(userId, field, value, at)) await writeMeta(field, { userId, updatedAt: at, dirty: false });
      }
      out[field] = localList;
      continue;
    }
    if (meta?.dirty && mine && localNewer) {
      const value = field === 'completed' ? pruneCompletedKeys(localList) : localList;
      if (await push(userId, field, value, localAt!)) await writeMeta(field, { userId, updatedAt: localAt, dirty: false });
      out[field] = localList;
      continue;
    }
    // The server copy is newer, or ours is already sent: take it.
    out[field] = remoteList;
    await writeMeta(field, { userId, updatedAt: remoteAt, dirty: false });
  }
  return out;
}
