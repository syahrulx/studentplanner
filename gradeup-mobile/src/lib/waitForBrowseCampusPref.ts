import type { Campus } from '@/src/lib/eventsApi';

import {
  BROWSE_ALL_CAMPUSES,
  getBrowseCampusPreference,
} from '@/src/lib/browseCampusPreference';

export type SettledCampusPref =
  | { kind: 'all' }
  | { kind: 'campus'; id: string }
  | { kind: 'timeout' };

/**
 * Poll until another screen saves a campus preference, or timeout (fail-open to “all”).
 */
export async function waitForBrowseCampusPrefSettled(
  userId: string,
  universityId: string,
  campuses: Campus[],
  isCancelled: () => boolean,
  options?: { intervalMs?: number; maxAttempts?: number }
): Promise<SettledCampusPref> {
  const intervalMs = options?.intervalMs ?? 180;
  const maxAttempts = options?.maxAttempts ?? 200;

  for (let i = 0; i < maxAttempts; i++) {
    if (isCancelled()) return { kind: 'timeout' };
    const pref = await getBrowseCampusPreference(userId, universityId);
    if (pref === BROWSE_ALL_CAMPUSES) return { kind: 'all' };
    if (pref && campuses.some((c) => c.id === pref)) return { kind: 'campus', id: pref };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { kind: 'timeout' };
}
