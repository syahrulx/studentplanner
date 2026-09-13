import { AppState, type AppStateStatus, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Wrapper around `WebBrowser.openAuthSessionAsync` that closes the sheet when
 * the app comes back after a long spell in the background.
 *
 * Why: on iOS the OAuth sheet is an `ASWebAuthenticationSession`, whose content
 * is drawn by a *separate system process* and proxied in as
 * `SFBrowserRemoteViewController`. Suspend the app long enough and iOS reclaims
 * that service process. Our side keeps the now-dangling proxy objects, and the
 * next present/dismiss transition releases blocks that captured them — an
 * over-release that crashes deep inside UIKit
 * (`_UIViewControllerTransitionContext _runAlongsideCompletions`), with no app
 * frames on the stack to point back here.
 *
 * Dismissing costs the user nothing: a Supabase OAuth URL that has sat idle for
 * minutes is expired anyway, so the sign-in could not have completed. They get
 * a closed sheet and an untouched login screen instead of a crash.
 *
 * Short trips out of the app are deliberately left alone — fetching a password
 * or a 2FA code from another app is a normal part of signing in, and the sheet
 * must survive it.
 */
const STALE_BACKGROUND_MS = 60_000;

/** Nested/concurrent sessions shouldn't happen, but don't let one unsubscribe the other. */
let activeSessions = 0;
let backgroundedAt: number | null = null;
let subscription: { remove: () => void } | null = null;

function handleAppStateChange(state: AppStateStatus): void {
  // iOS reports `inactive` whenever the sheet itself takes over, so only a real
  // `background` transition counts as the user leaving.
  if (state === 'background') {
    backgroundedAt = Date.now();
    return;
  }
  if (state !== 'active') return;

  const since = backgroundedAt;
  backgroundedAt = null;
  if (since === null || Date.now() - since < STALE_BACKGROUND_MS) return;

  // Resolves the pending openAuthSessionAsync with `{ type: 'dismiss' }`.
  WebBrowser.dismissAuthSession();
}

function startWatching(): void {
  activeSessions += 1;
  if (subscription) return;
  backgroundedAt = null;
  subscription = AppState.addEventListener('change', handleAppStateChange);
}

function stopWatching(): void {
  activeSessions = Math.max(0, activeSessions - 1);
  if (activeSessions > 0) return;
  subscription?.remove();
  subscription = null;
  backgroundedAt = null;
}

/** Drop-in replacement for `WebBrowser.openAuthSessionAsync`. */
export async function openAuthSession(
  url: string,
  redirectUrl: string,
): Promise<WebBrowser.WebBrowserAuthSessionResult> {
  // `dismissAuthSession` is a no-op off iOS, and the remote-view-controller
  // teardown this guards against is iOS-only.
  if (Platform.OS !== 'ios') {
    return WebBrowser.openAuthSessionAsync(url, redirectUrl);
  }

  startWatching();
  try {
    return await WebBrowser.openAuthSessionAsync(url, redirectUrl);
  } finally {
    stopWatching();
  }
}
