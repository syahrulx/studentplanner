import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useApp } from '@/src/context/AppContext';
import {
  getLockScreenConfigSnapshot,
  isLockScreenConfigLoadedFor,
  loadLockScreenConfig,
  saveLockScreenConfig,
  subscribeLockScreenConfig,
} from '@/src/lib/lockScreen/lockScreenConfig';
import { DEFAULT_LOCK_SCREEN_CONFIG, type LockScreenConfig } from '@/src/lib/lockScreen/types';

export type UpdateLockScreenConfig = (patch: Partial<LockScreenConfig>) => Promise<LockScreenConfig>;

/**
 * The signed-in user's lock screen config: `[config, update, loaded]`.
 *
 * Every caller shares the module snapshot, so an edit in the Studio reaches the
 * render host and the setup sheet in the same frame. Until this user's config
 * has loaded (first mount, or right after an account switch) it returns the
 * defaults with `loaded = false`, never the previous account's settings.
 */
export function useLockScreenConfig(): [LockScreenConfig, UpdateLockScreenConfig, boolean] {
  const { user } = useApp();
  const userId = user.id || null;
  const snapshot = useSyncExternalStore(subscribeLockScreenConfig, getLockScreenConfigSnapshot);
  const loaded = isLockScreenConfigLoadedFor(userId);

  useEffect(() => {
    void loadLockScreenConfig(userId);
  }, [userId]);

  const update = useCallback<UpdateLockScreenConfig>((patch) => saveLockScreenConfig(userId, patch), [userId]);

  return [loaded ? snapshot : DEFAULT_LOCK_SCREEN_CONFIG, update, loaded];
}
