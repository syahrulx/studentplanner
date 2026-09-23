import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from './supabase';
import * as confessionsApi from './confessionsApi';
import type { Confession } from './confessionsApi';

// "What's happening in Confessions" for surfaces outside the feed: the
// Community top-bar badge, the peek strip and the map bubbles. Everything is
// derived from one recent page + one hot page — no dedicated count RPC.

const LAST_SEEN_KEY = 'confessions:lastSeenAt';
const RECENT_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CampusPulse = { name: string; latitude: number; longitude: number; today: number };

export type ConfessionPulse = {
  /** Posts by others since the feed was last opened (capped at RECENT_LIMIT). */
  newCount: number;
  /** Up to 3 posts to rotate in the peek strip — hot first, newest as fallback. */
  peek: Confession[];
  /** Campuses with coordinates and at least one post in the last 24h. */
  campuses: CampusPulse[];
};

const EMPTY: ConfessionPulse = { newCount: 0, peek: [], campuses: [] };

/** Call when the user opens the feed so the badge clears. */
export async function markConfessionsSeen(): Promise<void> {
  await AsyncStorage.setItem(LAST_SEEN_KEY, new Date().toISOString()).catch(() => {});
}

async function loadPulse(universityId: string): Promise<ConfessionPulse> {
  const [recent, hot, lastSeenRaw, campusRows] = await Promise.all([
    confessionsApi.fetchConfessions({ limit: RECENT_LIMIT }),
    confessionsApi.fetchConfessions({ limit: 3, sort: 'hot' }).catch(() => [] as Confession[]),
    AsyncStorage.getItem(LAST_SEEN_KEY).catch(() => null),
    supabase
      .from('campuses')
      .select('name, latitude, longitude')
      .eq('university_id', universityId)
      .not('latitude', 'is', null)
      .then(({ data }) => (data ?? []) as { name: string; latitude: number; longitude: number }[]),
  ]);

  // First ever visit: don't greet with "50 new" — treat the last day as new.
  const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : Date.now() - DAY_MS;
  const newCount = recent.filter((c) => !c.is_mine && new Date(c.created_at).getTime() > lastSeen).length;

  const peek = (hot.length > 0 ? hot : recent).slice(0, 3);

  const since = Date.now() - DAY_MS;
  const today = new Map<string, number>();
  for (const c of recent) {
    if (!c.campus || new Date(c.created_at).getTime() < since) continue;
    today.set(c.campus, (today.get(c.campus) ?? 0) + 1);
  }
  const campuses = campusRows
    .map((r) => ({ ...r, today: today.get(r.name) ?? 0 }))
    .filter((r) => r.today > 0);

  return { newCount, peek, campuses };
}

/** Refreshes whenever the host screen regains focus. */
export function useConfessionPulse(universityId: string | null | undefined): ConfessionPulse {
  const [pulse, setPulse] = useState<ConfessionPulse>(EMPTY);

  useFocusEffect(
    useCallback(() => {
      if (!universityId) { setPulse(EMPTY); return; }
      let alive = true;
      loadPulse(universityId)
        .then((p) => { if (alive) setPulse(p); })
        .catch((e) => { if (__DEV__) console.warn('[confessionPulse]', e); });
      return () => { alive = false; };
    }, [universityId]),
  );

  return pulse;
}
