/**
 * A student's RenTaman avatar for a profile or a profile card.
 *
 * Allowed to fail: no avatar, no table, or no access all mean "nothing to
 * draw", never an error on screen. Kept for a few minutes so opening the same
 * friend's card twice doesn't ask again; refreshed when the screen regains
 * focus, so a look changed on rencana.app shows up on the way back.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchRentamanAvatar, type RentamanAvatar } from '@/src/lib/rentamanApi';

const KEEP_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: RentamanAvatar | null }>();
const listeners = new Set<(userId: string) => void>();

/** After the student flips their switch: every screen showing them updates at once. */
export function rememberRentamanShown(userId: string, shown: boolean) {
  const hit = cache.get(userId);
  if (hit?.value) cache.set(userId, { at: Date.now(), value: { ...hit.value, shown } });
  listeners.forEach((fn) => fn(userId));
}

export function useRentamanAvatar(userId: string | null | undefined): {
  avatar: RentamanAvatar | null;
  loading: boolean;
} {
  const [state, setState] = useState<{ avatar: RentamanAvatar | null; loading: boolean }>(() => {
    const hit = userId ? cache.get(userId) : undefined;
    return { avatar: hit?.value ?? null, loading: !hit && !!userId };
  });
  const [tick, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setTick((n) => n + 1);
    }, []),
  );

  useEffect(() => {
    const onChange = (id: string) => {
      if (id === userId) setState({ avatar: cache.get(id)?.value ?? null, loading: false });
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setState({ avatar: null, loading: false });
      return;
    }
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < KEEP_MS && tick <= 1) {
      setState({ avatar: hit.value, loading: false });
      return;
    }
    let cancelled = false;
    fetchRentamanAvatar(userId)
      .then((value) => {
        cache.set(userId, { at: Date.now(), value });
        if (!cancelled) setState({ avatar: value, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ avatar: s.avatar, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  return state;
}
