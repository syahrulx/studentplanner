import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { router, usePathname, useRootNavigationState, useSegments } from 'expo-router';
import { getSharedPayloads } from 'expo-sharing';
import { addPendingCaptureListener, peekPendingCapture, sweepStaleCaptures } from 'smart-capture';

import { useApp } from '@/src/context/AppContext';
import { supabase } from '@/src/lib/supabase';
import {
  enqueueCapture,
  getLastConsumedShareKey,
  isCaptureStale,
  peekCapture,
  shareKeyOf,
  subscribeCapture,
  takeCaptureIfStale,
} from '@/src/lib/smartCapture/captureInboxStore';

/**
 * Opens the Smart Capture sheet for captures that arrive from outside the app.
 *
 * Nothing navigates on the deep link itself (see app/+native-intent.ts): the
 * capture waits in the inbox until the app is genuinely ready — navigation
 * mounted, session restored, remote data loaded, and out of the `(auth)` gate
 * that would otherwise redirect the sheet away. A share received while signed
 * out therefore survives the whole login flow.
 */
export default function SmartCaptureLauncher() {
  const { dataReady } = useApp();
  const segments = useSegments();
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const navigationReady = !!navigationState?.key;
  const pending = useSyncExternalStore(subscribeCapture, peekCapture, peekCapture);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setHasSession(!!data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setHasSession(!!session);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // Cold start and every foreground: the URL hop can be missed (a share
  // extension that cannot open the host app, an App Intent that finished before
  // JS mounted), but the payload is still sitting in native storage.
  useEffect(() => {
    void sweepStaleCaptures();

    const probe = () => {
      if (peekCapture()) return;

      if (peekPendingCapture()) {
        enqueueCapture({ source: 'back_tap' });
        return;
      }

      try {
        const payloads = getSharedPayloads();
        if (payloads.length === 0) return;
        const key = shareKeyOf(payloads);
        if (key === getLastConsumedShareKey()) return;
        enqueueCapture({ source: 'share' });
      } catch {
        /* share-into is unavailable on this build */
      }
    };

    probe();

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') probe();
    });
    const captureSub = addPendingCaptureListener(() => {
      if (!peekCapture()) enqueueCapture({ source: 'back_tap' });
    });

    return () => {
      appStateSub.remove();
      captureSub.remove();
    };
  }, []);

  const lastPushedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    // In-app captures (paste, image picker) navigate from the screen that
    // created them, so pushing here as well would stack a second route.
    if (pending.source !== 'share' && pending.source !== 'back_tap') return;
    if (isCaptureStale(pending)) {
      takeCaptureIfStale();
      return;
    }
    if (!navigationReady || hasSession !== true || !dataReady) return;
    // Hold while the user is signing in or completing their profile — the
    // `(auth)` gate redirects on its own and would take the sheet with it.
    if (segments[0] === '(auth)') return;
    // Already open: useCaptureInbox picks up the newer capture in place.
    if (pathname === '/smart-capture') return;
    if (lastPushedRef.current === pending.id) return;

    lastPushedRef.current = pending.id;
    router.push({
      pathname: '/smart-capture',
      params: { source: pending.source, captureId: pending.id },
    } as never);
  }, [pending, navigationReady, hasSession, dataReady, segments, pathname]);

  return null;
}
