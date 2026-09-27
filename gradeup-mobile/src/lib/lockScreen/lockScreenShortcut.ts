import { AppState, Linking, Platform } from 'react-native';

import { createShortcutLinkSource, SHORTCUTS_APP_URL, type ShortcutLink } from '../shortcutLink';
import {
  LOCK_SCREEN_CALLBACK_RESULT_KEY,
  peekLockScreenCallback,
  subscribeLockScreenCallback,
  type LockScreenCallback,
  type LockScreenRunResult,
} from './lockScreenCallback';
import { loadLockScreenSetup, updateLockScreenSetup } from './lockScreenConfig';
import { noteLockShortcutsTrip } from './lockScreenHealth';
import { getLockRenderState, requestLockScreenRender } from './lockScreenRenderQueue';
import { readLockScreenStatus, type LockScreenStatus } from './lockScreenStore';
import type { LockRunOutcome } from './types';

export type { ShortcutLink } from '../shortcutLink';
export type { LockRunOutcome } from './types';

/**
 * Everything Rencana does with the "Rencana Lock Screen" shortcut: where to
 * install it, how to open Shortcuts for the manual steps and the automations,
 * and running it once from inside the app to prove the whole chain works.
 *
 * The x-callback only says how the run ended. The proof that a picture was
 * handed over is status.json, written by the App Intent, so every run reads
 * both before deciding what happened.
 *
 * Linking.canOpenURL('shortcuts://') is always false here (the app declares no
 * LSApplicationQueriesSchemes), so nothing is gated on it: each helper calls
 * openURL and treats a rejection as "not installed".
 */

/** The exact name the app runs; the published shortcut must match it character for character. */
export const LOCK_SHORTCUT_NAME = 'Rencana Lock Screen';

/**
 * True once the published iCloud shortcut ships with its iOS 27 triggers built
 * in. Only flip it after a copy with triggers is confirmed to import cleanly
 * on iOS 16.2–26; until then iOS 27 users add the triggers themselves.
 */
export const LOCK_SHORTCUT_HAS_TRIGGERS = false;

/** Swallowed by app/+native-intent.ts and reported through lockScreenCallback.ts. */
export const CALLBACK_BASE = 'rencana://lock-screen-callback';

export const lockScreenShortcutLink = createShortcutLinkSource(
  'lock_screen_shortcut_url',
  'lock_screen_shortcut_url',
);

/**
 * iOS 27 only: the two automations, shared as shortcuts that start with their
 * trigger ("Rencana Pagi" at 6:00 AM, "Rencana Bila Tutup" when Rencana is
 * closed) and run "Rencana Lock Screen" by name. Triggers arrive switched off,
 * so the student still turns each one on. Older iOS keeps automations outside
 * shortcuts, so it gets the build-it-yourself recipes instead.
 */
export const lockScreenAutomationLinks = {
  morning: createShortcutLinkSource('lock_screen_morning_shortcut_url', 'lock_screen_morning_shortcut_url'),
  close: createShortcutLinkSource('lock_screen_close_shortcut_url', 'lock_screen_close_shortcut_url'),
} as const;

/** Opens an automation's iCloud link, or the Shortcuts app if the link is gone. */
export async function openLockAutomationInstall(link: ShortcutLink): Promise<boolean> {
  return openFirst(link.isPublished ? [link.url, SHORTCUTS_APP_URL] : [SHORTCUTS_APP_URL]);
}

/** 0 off iOS, so version checks never mistake an Android API level for an iOS release. */
export function iosMajorVersion(): number {
  if (Platform.OS !== 'ios') return 0;
  return parseInt(String(Platform.Version), 10) || 0;
}

export function buildRunShortcutUrl(): string {
  // Not `result`: Shortcuts appends that to x-success with the shortcut's
  // output, and a repeated key would overwrite ours.
  const callback = (result: LockScreenRunResult) =>
    encodeURIComponent(`${CALLBACK_BASE}?${LOCK_SCREEN_CALLBACK_RESULT_KEY}=${result}`);
  return (
    `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(LOCK_SHORTCUT_NAME)}` +
    `&x-success=${callback('success')}` +
    `&x-error=${callback('error')}` +
    `&x-cancel=${callback('cancel')}`
  );
}

/**
 * Tries each URL in order. Shortcuts accepts any path under its scheme, so a
 * fallback only matters when a URL is rejected outright.
 */
async function openFirst(urls: string[]): Promise<boolean> {
  // Every trip there is one where the student might run the shortcut by
  // hand, which the automation detector must not mistake for an automation.
  noteLockShortcutsTrip();
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      /* try the next, plainer URL */
    }
  }
  return false;
}

/**
 * Setup step 1's install action. Stamps shortcutOpenedAt first, because the
 * step auto-advances when the student comes back from Shortcuts.
 */
export async function openLockShortcutInstall(link: ShortcutLink): Promise<boolean> {
  await updateLockScreenSetup({ shortcutOpenedAt: Date.now() }).catch(() => {});
  if (!link.isPublished) return openShortcutsForManualBuild();
  // A revoked iCloud link should still land where the manual steps apply.
  return openFirst([link.url, SHORTCUTS_APP_URL]);
}

export async function openShortcutsForManualBuild(): Promise<boolean> {
  return openFirst(['shortcuts://create-shortcut', SHORTCUTS_APP_URL]);
}

export async function openAutomationCreation(): Promise<boolean> {
  // iOS 27 builds an automation as a new shortcut that starts with a trigger.
  // There is no documented URL for that screen, so open the app itself.
  if (iosMajorVersion() >= 27) return openFirst([SHORTCUTS_APP_URL]);
  // Undocumented and argument-free: it only jumps to the creation screen.
  return openFirst(['shortcuts://create-automation', SHORTCUTS_APP_URL]);
}

// ─── Running the shortcut from inside Rencana ────────────────────────────────

/** The longest a run (including the one automatic retry) may take. */
const RUN_CAP_MS = 180_000;
/**
 * Opening Shortcuts, running and switching back takes longer than this, so an
 * earlier return means the app switch bounced, not that the run ended.
 */
const MIN_RUN_MS = 2_500;
/** The callback URL can land just after Rencana becomes active again. */
const RETURN_GRACE_MS = 1_500;
/** status.json can trail the callback slightly; look for the serve this long. */
const SERVED_POLL_WINDOW_MS = 3_000;
const SERVED_POLL_MS = 300;
/**
 * A serve must also be recent, so a status file that could not be read for
 * the baseline is not mistaken for this run. Slack covers the intent's
 * millisecond rounding.
 */
const SERVED_SLACK_MS = 2_000;
/** How long the automatic retry waits for today's picture before giving up. */
const RENDER_WAIT_MS = 30_000;
/**
 * How long a run waits, before opening Shortcuts, for today's picture to
 * catch up with the latest edit. Usually no wait at all.
 */
const PRE_RUN_RENDER_WAIT_MS = 10_000;
/** The x-callback lands before iOS reports the app active again; this is ample for that gap. */
const ACTIVE_WAIT_MS = 5_000;

// Messages thrown by GetLockScreenImageIntent (LockScreenIntents.swift) and
// by Shortcuts itself when the name does not resolve.
const NOT_READY = /ready yet/i;
const STORAGE = /shared storage/i;
const LOCKED = /unlock/i;
const NOT_FOUND = /find|exist|found|no shortcut/i;

type ShortcutReturn =
  | { kind: 'notOpened' }
  | { kind: 'callback'; callback: LockScreenCallback }
  /** Back in Rencana (or timed out) without a callback. */
  | { kind: 'silent' };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Waits for `promise` to settle, but never longer than `ms`. */
function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    promise.then(done, done);
  });
}

/**
 * Opens the run URL and waits for whichever comes first: a callback from this
 * run, Rencana coming back to the foreground with no callback, or the cap.
 * Listeners go up before openURL so a fast callback cannot be missed.
 */
function openAndAwaitReturn(runStartedAt: number, deadline: number): Promise<ShortcutReturn> {
  return new Promise((resolve) => {
    let settled = false;
    let sawBackground = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearGrace = () => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = null;
    };
    // Only ever called from listeners and timers, after everything below exists.
    const finish = (result: ShortcutReturn) => {
      if (settled) return;
      settled = true;
      unsubscribeCallback();
      appStateSubscription.remove();
      clearGrace();
      clearTimeout(capTimer);
      resolve(result);
    };

    const unsubscribeCallback = subscribeLockScreenCallback((callback) => {
      if (callback.at > runStartedAt) finish({ kind: 'callback', callback });
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        sawBackground = true;
        clearGrace();
        // The passive automation detector treats a serve after the last
        // background as an automation unless lastManualRunAt is at or after
        // that background. The render host stamps lastBackgroundAt from a
        // listener registered at launch, so it runs before this one; stamping
        // again here keeps this run (and the "Is Closed" automation it sets
        // off) from being counted as a working automation.
        void updateLockScreenSetup({ lastManualRunAt: Date.now() }).catch(() => {});
      } else if (state === 'active' && sawBackground) {
        clearGrace();
        const wait = Math.max(RETURN_GRACE_MS, runStartedAt + MIN_RUN_MS - Date.now());
        graceTimer = setTimeout(() => finish({ kind: 'silent' }), wait);
      }
    });

    const capTimer = setTimeout(
      () => finish({ kind: 'silent' }),
      Math.max(0, deadline - Date.now()),
    );

    Linking.openURL(buildRunShortcutUrl()).catch(() => finish({ kind: 'notOpened' }));
  });
}

/**
 * Polls status.json for a serve that belongs to this run. Opening Shortcuts
 * also fires the student's "Rencana Is Closed" automation, so two serves in a
 * row are normal; any serve after the baseline counts, and the newest one
 * (the one on screen) is returned.
 */
async function awaitServe(baseline: number, runStartedAt: number): Promise<LockScreenStatus | null> {
  for (let elapsed = 0; ; elapsed += SERVED_POLL_MS) {
    const status = readLockScreenStatus();
    if (
      status &&
      status.lastServedAt > baseline &&
      status.lastServedAt >= runStartedAt - SERVED_SLACK_MS
    ) {
      return status;
    }
    if (elapsed >= SERVED_POLL_WINDOW_MS) return null;
    await sleep(SERVED_POLL_MS);
  }
}

async function classify(
  back: Exclude<ShortcutReturn, { kind: 'notOpened' }>,
  baseline: number,
  runStartedAt: number,
): Promise<LockRunOutcome> {
  const callback = back.kind === 'callback' ? back.callback : null;
  const errorMessage = callback?.errorMessage;

  // The intent's own errors: it served nothing, so there is no need to wait
  // for status.json.
  if (callback?.result === 'error' && errorMessage) {
    if (NOT_READY.test(errorMessage)) return { kind: 'notReady' };
    if (STORAGE.test(errorMessage)) return { kind: 'storage' };
    if (LOCKED.test(errorMessage)) return { kind: 'locked' };
  }

  const served = await awaitServe(baseline, runStartedAt);

  switch (callback?.result) {
    case 'success':
      // Finished cleanly without asking Rencana for a picture: the shortcut
      // with this name is not ours.
      return served
        ? { kind: 'ok', servedAt: served.lastServedAt, usedFallback: served.usedFallback }
        : { kind: 'wrongShortcut' };
    case 'error':
      if (served) return { kind: 'wallpaperFailed', errorMessage };
      return errorMessage && NOT_FOUND.test(errorMessage)
        ? { kind: 'notFound', errorMessage }
        : { kind: 'couldntRun', errorMessage };
    case 'cancel':
      // Served, then cancelled: Set Wallpaper's "Show Preview" is still on.
      return served ? { kind: 'previewCancelled' } : { kind: 'cancelled' };
    default:
      return served
        ? { kind: 'ok', servedAt: served.lastServedAt, usedFallback: served.usedFallback }
        : { kind: 'cancelled' };
  }
}

async function runOnce(deadline: number): Promise<LockRunOutcome> {
  const baseline = readLockScreenStatus()?.lastServedAt ?? 0;
  const runStartedAt = Date.now();
  await updateLockScreenSetup({ lastManualRunAt: runStartedAt }).catch(() => {});

  const back = await openAndAwaitReturn(runStartedAt, deadline);
  if (back.kind === 'notOpened') return { kind: 'noShortcutsApp' };
  return classify(back, baseline, runStartedAt);
}

/**
 * The x-callback reaches JS before iOS reports Rencana active again, and the
 * render host won't draw while it still thinks the app is backgrounded.
 */
function whenActive(ms: number): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      subscription.remove();
      resolve();
    };
    const timer = setTimeout(done, ms);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') done();
    });
  });
}

async function runWithRetry(autoRetryNotReady: boolean): Promise<LockRunOutcome> {
  const deadline = Date.now() + RUN_CAP_MS;
  // An edit in the Studio only schedules a pass, so right after one the live
  // picture still shows the old design; the run would set that and report
  // success. The host answers at once when today's picture is already current.
  await settleWithin(requestLockScreenRender({ priority: 'today', reason: 'manual-run' }), PRE_RUN_RENDER_WAIT_MS);
  const first = await runOnce(deadline);
  if (first.kind !== 'notReady' || !autoRetryNotReady) return first;

  // The intent found nothing for today. Draw it now, then try exactly once
  // more; if the picture still is not ready, report it rather than bouncing
  // the student through Shortcuts again. The queue resolves even when no host
  // could draw, so the render state is the answer, not the promise.
  await whenActive(ACTIVE_WAIT_MS);
  await settleWithin(
    requestLockScreenRender({ priority: 'today', reason: 'not-ready-retry' }),
    Math.min(RENDER_WAIT_MS, deadline - Date.now()),
  );
  if (!getLockRenderState().todayReady || Date.now() >= deadline) return first;
  return runOnce(deadline);
}

/**
 * The setup writes a finished run earns, whoever started it (setup, the
 * Studio's Update now, or a run recovered after a relaunch). A picture served
 * from our shortcut also proves step 1, whichever way the student got here.
 */
function recordLockRunOutcome(outcome: LockRunOutcome): void {
  if (outcome.kind === 'ok') {
    const now = Date.now();
    void updateLockScreenSetup((current) => ({
      firstRunVerifiedAt: now,
      wallpaperFailCount: 0,
      shortcutStepDoneAt: current.shortcutStepDoneAt ?? now,
    })).catch(() => {});
  } else if (outcome.kind === 'wallpaperFailed') {
    void updateLockScreenSetup((current) => ({ wallpaperFailCount: current.wallpaperFailCount + 1 })).catch(() => {});
  }
}

let inFlight: Promise<LockRunOutcome> | null = null;
/** A callback in a process that never started a run belongs to a run whose process died. */
let ranThisSession = false;
/** `at` of the last callback reconcileInterruptedLockRun looked at. */
let reconciledCallbackAt = 0;

/**
 * Runs "Rencana Lock Screen" through Shortcuts and reports what happened, and
 * records the outcome in the setup state. Never rejects. A call made while a
 * run is in flight gets that run's promise (and its options), so a double tap
 * cannot open Shortcuts twice.
 */
export function runLockScreenShortcut(opts?: { autoRetryNotReady?: boolean }): Promise<LockRunOutcome> {
  if (!inFlight) {
    ranThisSession = true;
    inFlight = runWithRetry(opts?.autoRetryNotReady === true)
      .catch((error: unknown): LockRunOutcome => {
        if (__DEV__) console.warn('[lockScreenShortcut] run failed unexpectedly', error);
        return { kind: 'couldntRun' };
      })
      .then((outcome) => {
        // Here rather than in the screen, so it lands even if the screen is gone.
        recordLockRunOutcome(outcome);
        return outcome;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * If iOS killed Rencana while Shortcuts was setting the wallpaper, the
 * x-callback relaunches the app and nothing is left to hear it. Classify that
 * run from the callback and status.json as if it had been heard, so a
 * wallpaper that was set still counts. Safe to call repeatedly.
 */
export async function reconcileInterruptedLockRun(): Promise<void> {
  if (ranThisSession) return;
  const callback = peekLockScreenCallback();
  if (!callback || callback.at <= reconciledCallbackAt) return;
  reconciledCallbackAt = callback.at;
  const { lastManualRunAt } = await loadLockScreenSetup();
  // The runner stamps lastManualRunAt when it starts and again as Shortcuts
  // takes over; a callback past the run cap belongs to nothing we can vouch for.
  if (lastManualRunAt == null || callback.at - lastManualRunAt > RUN_CAP_MS || ranThisSession) return;
  recordLockRunOutcome(await classify({ kind: 'callback', callback }, 0, lastManualRunAt));
}
