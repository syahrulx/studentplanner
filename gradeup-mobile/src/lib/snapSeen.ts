/**
 * Which snaps this phone has already opened.
 *
 * Local on purpose. "Have I seen this?" is a question about this device and
 * this person, not a fact worth a row in a shared table — and a snap lives for
 * 24 hours, so a server round trip would be spent on something that is about
 * to stop existing.
 *
 * Stored as id → ISO date rather than a plain list, so entries can be pruned
 * by age. Without that the set would grow forever: snaps expire, but their ids
 * would not have left this file.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'seenSnapIds_v1';

/** A snap lives 24h. 48 gives a comfortable margin for clock drift. */
const KEEP_MS = 48 * 60 * 60 * 1000;

type SeenMap = Record<string, string>;

async function read(): Promise<SeenMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Unreadable or corrupt: treat everything as unseen. Showing a snap again
    // is a far smaller problem than failing to show the row at all.
    return {};
  }
}

function prune(map: SeenMap): SeenMap {
  const cutoff = Date.now() - KEEP_MS;
  const out: SeenMap = {};
  for (const [id, at] of Object.entries(map)) {
    const t = Date.parse(at);
    if (Number.isFinite(t) && t >= cutoff) out[id] = at;
  }
  return out;
}

export async function getSeenSnapIds(): Promise<Set<string>> {
  return new Set(Object.keys(prune(await read())));
}

export async function markSnapSeen(snapId: string): Promise<void> {
  if (!snapId) return;
  try {
    const next = prune(await read());
    next[snapId] = new Date().toISOString();
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Non-fatal. The worst case is a ring that stays bright after it was read.
  }
}
