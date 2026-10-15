import { supabase } from './supabase';

/**
 * A student's own past snaps, for the Memories screen and the monthly dump.
 *
 * Only ever the signed-in student's snaps: the query filters on their id, and
 * the "Users can read own snaps" policy is the only one that reaches past the
 * 24 hours a snap is live. Snaps a moderator removed are left out.
 */

export type MemorySnap = {
  id: string;
  imageUrl: string;
  caption: string;
  createdAt: string;
};

export type MemoryMonth = {
  /** "2026-10" */
  key: string;
  /** "October 2026" */
  label: string;
  /** "October" */
  monthName: string;
  year: number;
  snaps: MemorySnap[];
  /** Different calendar days with at least one snap. */
  activeDays: number;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Newest first, at most this many snaps. Enough for a long time at a few a day. */
const MAX_SNAPS = 2000;

export async function getMyMemoryMonths(userId: string): Promise<MemoryMonth[]> {
  const { data, error } = await supabase
    .from('study_snaps')
    .select('id, image_url, caption, created_at, status')
    .eq('user_id', userId)
    .neq('status', 'removed')
    .order('created_at', { ascending: false })
    .limit(MAX_SNAPS);
  if (error) throw error;
  return groupByMonth(
    (data ?? []).map((r: any) => ({
      id: String(r.id),
      imageUrl: String(r.image_url),
      caption: r.caption ? String(r.caption) : '',
      createdAt: String(r.created_at),
    })),
  );
}

/** Groups snaps (any order) into months, newest month first, snaps oldest first inside. */
export function groupByMonth(snaps: MemorySnap[]): MemoryMonth[] {
  const byKey = new Map<string, MemorySnap[]>();
  for (const s of snaps) {
    const d = new Date(s.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byKey.set(key, [...(byKey.get(key) ?? []), s]);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, list]) => {
      const [y, m] = key.split('-').map(Number);
      const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const days = new Set(sorted.map((s) => new Date(s.createdAt).getDate()));
      return {
        key,
        label: `${MONTHS[m - 1]} ${y}`,
        monthName: MONTHS[m - 1],
        year: y,
        snaps: sorted,
        activeDays: days.size,
      };
    });
}

/** `count` snaps picked at random, then put back in date order. */
export function randomPick<T extends { createdAt: string }>(list: T[], count: number, seed = Math.random()): T[] {
  if (list.length <= count) return [...list];
  // Small seeded shuffle so "Shuffle" gives a new set each press.
  let s = Math.floor(seed * 2 ** 31) || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
