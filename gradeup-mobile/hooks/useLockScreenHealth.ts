import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useLockScreenConfig } from '@/hooks/useLockScreenConfig';
import { subscribeLockScreenCallback } from '@/src/lib/lockScreen/lockScreenCallback';
import {
  getLockScreenSetupSnapshot,
  isLockScreenSetupLoaded,
  loadLockScreenSetup,
  subscribeLockScreenSetup,
} from '@/src/lib/lockScreen/lockScreenConfig';
import { deriveLockScreenHealth, lockScreenUnsupportedReason } from '@/src/lib/lockScreen/lockScreenHealth';
import { getLockRenderState, subscribeLockRenderState } from '@/src/lib/lockScreen/lockScreenRenderQueue';
import { readLockScreenStatus, type LockScreenStatus } from '@/src/lib/lockScreen/lockScreenStore';
import type { LockRenderState, LockScreenHealth, LockScreenSetupState } from '@/src/lib/lockScreen/types';

export interface LockScreenHealthView {
  health: LockScreenHealth;
  /** Last status.json the App Intent wrote, or null if it never served a picture. */
  status: LockScreenStatus | null;
  setup: LockScreenSetupState;
  renderState: LockRenderState;
  /** Config and setup state have been read from storage; until then `health` may say 'off'. */
  loaded: boolean;
  /** Re-reads status.json now (e.g. right after a manual run) and returns it. */
  refresh: () => LockScreenStatus | null;
}

function sameStatus(a: LockScreenStatus | null, b: LockScreenStatus | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.lastServedAt === b.lastServedAt &&
    a.count === b.count &&
    a.servedFile === b.servedFile &&
    a.servedDateISO === b.servedDateISO &&
    a.usedFallback === b.usedFallback
  );
}

/**
 * Status and health of the self-refreshing lock screen, for screens (it uses
 * useFocusEffect, so it needs a navigator above it).
 *
 * status.json is written by the App Intent while Rencana is usually in the
 * background, so nothing notifies us; it is re-read on focus, when the app
 * becomes active, when a Shortcuts run calls back, and after every picture the
 * render host writes. The automation detector is not run here — the render
 * host and the setup sheet own that write.
 */
export function useLockScreenHealth(): LockScreenHealthView {
  const [config, , configLoaded] = useLockScreenConfig();
  const setup = useSyncExternalStore(subscribeLockScreenSetup, getLockScreenSetupSnapshot);
  const renderState = useSyncExternalStore(subscribeLockRenderState, getLockRenderState);
  const [reading, setReading] = useState(() => ({ status: readLockScreenStatus(), now: Date.now() }));

  const refresh = useCallback(() => {
    const status = readLockScreenStatus();
    const now = Date.now();
    // Keep the old object when nothing changed, so consumers' effects don't re-fire.
    setReading((prev) => ({ status: sameStatus(prev.status, status) ? prev.status : status, now }));
    return status;
  }, []);

  useEffect(() => {
    void loadLockScreenSetup();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    const unsubscribeCallback = subscribeLockScreenCallback(() => {
      refresh();
    });
    return () => {
      appState.remove();
      unsubscribeCallback();
    };
  }, [refresh]);

  useEffect(() => {
    if (renderState.lastWrittenAt != null) refresh();
  }, [renderState.lastWrittenAt, refresh]);

  const derived = deriveLockScreenHealth({
    unsupported: lockScreenUnsupportedReason(),
    autoRefresh: config.autoRefresh,
    setup,
    status: reading.status,
    now: reading.now,
  });
  // Every refresh moves `now`, but health only changes at a threshold; keep one
  // object per distinct value so effects keyed on it fire on real transitions.
  const healthKey = JSON.stringify(derived);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const health = useMemo(() => derived, [healthKey]);

  return {
    health,
    status: reading.status,
    setup,
    renderState,
    loaded: configLoaded && isLockScreenSetupLoaded(),
    refresh,
  };
}
