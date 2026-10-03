import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AppState, InteractionManager, Platform, View, type AppStateStatus } from 'react-native';
import { File } from 'expo-file-system';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import LockCanvas from '@/components/lockScreen/LockCanvas';
import type { ThemePalette } from '@/constants/Themes';
import { useLockScreenConfig } from '@/hooks/useLockScreenConfig';
import { useLockScreenModelInput } from '@/hooks/useLockScreenModelInput';
import { useDarkMinimalThemePack, useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import type { TranslationKey } from '@/src/i18n';
import { captureError } from '@/src/lib/monitoring';
import { subscribeLockScreenCallback } from '@/src/lib/lockScreen/lockScreenCallback';
import {
  getLockScreenConfigSnapshot,
  loadLockScreenSetup,
  updateLockScreenSetup,
} from '@/src/lib/lockScreen/lockScreenConfig';
import { lockScreenUses24h } from '@/src/lib/lockScreen/lockScreenFormat';
import { getLockCanvasSize } from '@/src/lib/lockScreen/lockScreenGeometry';
import { runLockScreenAutomationDetector } from '@/src/lib/lockScreen/lockScreenHealth';
import {
  buildLockScreenModels,
  fnv1a32,
  lockScreenSignature,
  type LockScreenModelInput,
} from '@/src/lib/lockScreen/lockScreenModel';
import { resolveLockInk, themeGradient } from '@/src/lib/lockScreen/lockScreenPalette';
import { reconcileInterruptedLockRun } from '@/src/lib/lockScreen/lockScreenShortcut';
import {
  _registerRenderHost,
  _setLockRenderState,
  getLockRenderState,
  type LockRenderPriority,
  type LockRenderRequest,
} from '@/src/lib/lockScreen/lockScreenRenderQueue';
import {
  clearLockScreenImages,
  isLockScreenStoreAvailable,
  lockScreenImageUriFor,
  readLockScreenManifest,
  writeLockScreenGeneration,
  type LockScreenGenerationInput,
  type LockScreenManifest,
} from '@/src/lib/lockScreen/lockScreenStore';
import type { LockScreenConfig, LockScreenDayModel } from '@/src/lib/lockScreen/types';
import { getTodayISO } from '@/src/utils/date';

/**
 * Draws the lock screen pictures (today..today+6 plus the undated fallback)
 * offscreen and moves them into the App Group, where the "Get lock screen
 * image" intent serves today's to a Shortcuts automation. Mounted once in the
 * root layout; screens talk to it only through lockScreenRenderQueue.
 *
 * A pass plans every picture, hashes each model into a signature and redraws
 * only the ones whose signature differs from the live manifest, one canvas at
 * a time, today first. Everything else carries forward untouched, so a day
 * rollover redraws one picture and a task edit redraws the days it touches.
 *
 * Render phases as seen by the Studio and the setup sheet:
 *   rendering  a pass is drawing (done/total)
 *   waiting    pictures are still out of date, but the app left the
 *              foreground; the next 'active' picks them up
 *   error      the last pass failed; it is retried on the next trigger
 *
 * Nothing here may crash the app: a failed capture or write only sets the
 * phase to 'error', and a template that throws is caught by CanvasBoundary.
 */

/** Settle bursts (a sync landing, a drag in the Studio) into one pass. */
const INPUT_DEBOUNCE_MS = 400;
/** LockCanvas reports ready once its background is decoded; past this, capture what is there (marked degraded). */
const READY_TIMEOUT_MS = 3000;
/** Breathing room between captures, so taps and scrolling stay smooth while a week is drawn. */
const PACE_MS = 120;
/** Past local midnight, so getTodayISO() has certainly rolled over. */
const MIDNIGHT_GRACE_MS = 5000;
/** A requestLockScreenRender caller always hears back, even if passes keep being superseded. */
const WAITER_TIMEOUT_MS = 45_000;
/** Automatic retries after a failed pass, RETRY_BASE_MS × attempt apart; after that, the next trigger. */
const MAX_AUTO_RETRIES = 2;
const RETRY_BASE_MS = 5000;
/** Planning key of the undated picture; can never collide with a YYYY-MM-DD key. */
const FALLBACK_KEY = 'fallback';

type Timer = ReturnType<typeof setTimeout>;
type Translate = (key: TranslationKey) => string;

/** Everything one pass draws from. A new object whenever any of it changes. */
type HostInputs = Omit<LockScreenModelInput, 'nowMs' | 'uses24h'> & {
  config: LockScreenConfig;
  theme: ThemePalette;
  darkMinimal: boolean;
};

interface PlannedPicture {
  /** A date (YYYY-MM-DD) or FALLBACK_KEY. */
  key: string;
  model: LockScreenDayModel;
  signature: string;
}

interface Plan {
  inputs: HostInputs;
  todayISO: string;
  /** today..today+6 */
  dates: string[];
  pictures: Record<string, PlannedPicture>;
  /** Keys to redraw, in draw order: today, the fallback, then the rest of the week. */
  dirty: string[];
  manifest: LockScreenManifest | null;
  W: number;
  H: number;
  s: number;
  pixelW: number;
  pixelH: number;
}

/** What the offscreen canvas is drawing right now. */
interface CaptureJob {
  id: string;
  model: LockScreenDayModel;
  config: LockScreenConfig;
  theme: ThemePalette;
  darkMinimal: boolean;
  T: Translate;
  W: number;
  H: number;
  s: number;
}

interface Shot {
  /** As captureRef returned it; releaseCapture only accepts this form. */
  path: string;
  /** file:// form for expo-file-system. */
  uri: string;
  signature: string;
}

interface PendingDay {
  dateISO: string;
  shot: Shot;
}

interface Waiter {
  priority: LockRenderPriority;
  resolve: () => void;
  timer: Timer;
}

// ─── Planning ────────────────────────────────────────────────────────────────

/**
 * The accent is what the signature knows about the theme. The Theme
 * background is painted from four theme colours, not just the accent, so they
 * are folded in; otherwise a custom-theme edit would leave old pictures live.
 */
function signatureAccent({ config, theme, darkMinimal }: HostInputs): string {
  const { accent } = resolveLockInk(config.panel, theme, darkMinimal);
  return config.background === 'theme' ? `${accent}|${themeGradient(theme).join(',')}` : accent;
}

function photoStamp(config: LockScreenConfig): string | null {
  if (config.background !== 'photo' || !config.photoPath) return null;
  try {
    const file = new File(config.photoPath);
    return file.exists ? String(file.modificationTime ?? 0) : 'missing';
  } catch {
    return 'missing';
  }
}

function planPictures(inputs: HostInputs): Plan {
  const { W, H, scale, s, pixelW, pixelH } = getLockCanvasSize();
  const todayISO = getTodayISO();
  // A fresh object every pass: the model caches per input object, and nowMs differs.
  const modelInput: LockScreenModelInput = { ...inputs, nowMs: Date.now(), uses24h: lockScreenUses24h() };
  const { dates, days, fallback } = buildLockScreenModels(modelInput, todayISO);
  const env = { W, H, scale, accent: signatureAccent(inputs), photoStamp: photoStamp(inputs.config) };

  const pictures: Record<string, PlannedPicture> = {};
  const add = (key: string, model: LockScreenDayModel) => {
    pictures[key] = { key, model, signature: lockScreenSignature(model, inputs.config, env) };
  };
  for (const dateISO of dates) add(dateISO, days[dateISO]);
  add(FALLBACK_KEY, fallback);

  const manifest = readLockScreenManifest();
  const isStale = (key: string): boolean => {
    const { signature } = pictures[key];
    if (!manifest) return true;
    if (key === FALLBACK_KEY) return !manifest.fallback || manifest.fallbackSignature !== signature;
    // lockScreenImageUriFor also confirms the day's file is still on disk.
    return !manifest.days[key] || manifest.daySignatures[key] !== signature || lockScreenImageUriFor(key) == null;
  };

  return {
    inputs,
    todayISO,
    dates,
    pictures,
    dirty: [todayISO, FALLBACK_KEY, ...dates.slice(1)].filter(isStale),
    manifest,
    W,
    H,
    s,
    pixelW,
    pixelH,
  };
}

/**
 * A capture whose readiness timed out goes live under this marker. Its panel
 * is current, so it is served and carried like any other, but it never
 * matches a plan, so the next pass redraws it.
 */
const DEGRADED_SUFFIX = ':degraded';

/** The stored picture shows what `planned` describes (possibly over a bare backdrop). */
function showsPlanned(stored: string | null | undefined, planned: string): boolean {
  return stored === planned || stored === `${planned}${DEGRADED_SUFFIX}`;
}

/**
 * The next manifest: fresh captures plus carry-forward. A day that was not
 * redrawn keeps its live file only while that file shows exactly what it
 * would show now; otherwise it is left out and the intent serves the honest
 * fallback until the day is redrawn. Days outside the range drop off.
 *
 * The fallback itself is replaced, never dropped: it is what the intent
 * serves for every day left out, and a stale backup beats an automation that
 * fails with "not ready yet". It keeps its old signature, so the next pass
 * still sees it as out of date and redraws it.
 */
function generationInput(
  plan: Plan,
  generation: string,
  live: LockScreenManifest | null,
  fresh: PendingDay[],
  freshFallback: Shot | null,
): LockScreenGenerationInput {
  const freshDates = new Set(fresh.map((d) => d.dateISO));
  const carry = plan.dates.flatMap((dateISO) => {
    const file = live?.days[dateISO];
    const stored = live?.daySignatures[dateISO];
    return !freshDates.has(dateISO) && file && stored != null && showsPlanned(stored, plan.pictures[dateISO].signature)
      ? [{ dateISO, file, signature: stored }]
      : [];
  });

  const carryFallback =
    !freshFallback && live?.fallback ? { file: live.fallback, signature: live.fallbackSignature ?? '' } : null;

  const entries = [
    ...fresh.map((d) => `${d.dateISO}=${d.shot.signature}`),
    ...carry.map((c) => `${c.dateISO}=${c.signature}`),
  ].sort();

  return {
    generation,
    signature: fnv1a32(
      JSON.stringify([entries, freshFallback ? freshFallback.signature : (carryFallback?.signature ?? null)]),
    ),
    width: plan.pixelW,
    height: plan.pixelH,
    days: fresh.map((d) => ({ dateISO: d.dateISO, tmpUri: d.shot.uri, signature: d.shot.signature })),
    carry,
    fallbackTmpUri: freshFallback?.uri ?? null,
    fallbackSignature: freshFallback ? freshFallback.signature : null,
    carryFallback,
  };
}

/**
 * A live day whose file no longer shows what that day's model says. The
 * intent trusts the manifest as-is, so such a day must be written out even by
 * a pass that captured nothing, or tomorrow's automation serves it.
 */
function liveHasStaleDay(plan: Plan, live: LockScreenManifest | null): boolean {
  return plan.dates.some(
    (dateISO) =>
      live?.days[dateISO] != null && !showsPlanned(live.daySignatures[dateISO], plan.pictures[dateISO].signature),
  );
}

function isTodayLive(written: LockScreenManifest, plan: Plan): boolean {
  const { todayISO } = plan;
  const planned = plan.pictures[todayISO].signature;
  return written.days[todayISO] != null && showsPlanned(written.daySignatures[todayISO], planned);
}

// ─── Small helpers ───────────────────────────────────────────────────────────

/** captureRef answers with a bare path on iOS; expo-file-system needs a file:// URI. */
function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${encodeURI(path)}`;
}

function discardCapture(path: string): void {
  try {
    releaseCapture(path);
  } catch {
    /* iOS empties tmp/ on its own */
  }
}

function pace(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => setTimeout(resolve, PACE_MS));
  });
}

/**
 * Resolves true when `promise` does, false after `ms` if it hasn't; rejects
 * if `promise` does first.
 */
function within(promise: Promise<void>, ms: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function msUntilNextMidnight(): number {
  const now = new Date();
  // Built from local calendar fields, so a DST night is still one day long.
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * The render loop, kept outside React so a pass always reads the latest
 * inputs and state without stale closures. The component only feeds it inputs
 * and AppState changes and mounts whatever job it asks for.
 */
function createRenderEngine(mount: (job: CaptureJob | null) => void, wrapper: RefObject<View | null>) {
  /** null while the host is inactive (auto-refresh off, signed out, data or config loading). */
  let inputs: HostInputs | null = null;
  let version = 0;
  /** Bumped on deactivation; a pass from an older epoch stops at its next check and writes nothing. */
  let epoch = 0;
  let appState: AppStateStatus = AppState.currentState;
  /** Something may be out of date that no input change will announce (backgrounded, a pass cut short). */
  let dirty = false;
  let lastPlannedToday: string | null = null;
  /** Inputs version and date at which today's current picture went live. */
  let todayLive: { version: number; todayISO: string } | null = null;
  let running = false;
  let queued: { todayOnly: boolean } | null = null;
  let debounce: Timer | null = null;
  let retry: Timer | null = null;
  let midnight: Timer | null = null;
  let errorStreak = 0;
  let unregister: (() => void) | null = null;
  let pendingReady: { id: string; resolve: () => void; reject: (error: unknown) => void } | null = null;
  let canvasError: { id: string; error: unknown } | null = null;
  const waiters = new Set<Waiter>();
  const reported = new Set<string>();

  function clearTimer(timer: Timer | null): null {
    if (timer) clearTimeout(timer);
    return null;
  }

  function settle(waiter: Waiter): void {
    clearTimeout(waiter.timer);
    if (waiters.delete(waiter)) waiter.resolve();
  }

  function settleWaiters(scope: LockRenderPriority): void {
    for (const waiter of [...waiters]) {
      if (scope === 'all' || waiter.priority === 'today') settle(waiter);
    }
  }

  function markTodayLive(atVersion: number, todayISO: string): void {
    todayLive = { version: atVersion, todayISO };
    settleWaiters('today');
  }

  function start(todayOnly: boolean): void {
    if (!inputs) return;
    debounce = clearTimer(debounce);
    retry = clearTimer(retry);
    // iOS may not draw a backgrounded view, and a background launch by the
    // intent needs its memory for the intent: wait for the foreground.
    if (appState === 'background') {
      dirty = true;
      return;
    }
    if (running) {
      // One pass at a time; a full request outranks a today-only one.
      queued = { todayOnly: (queued?.todayOnly ?? true) && todayOnly };
      return;
    }
    running = true;
    void runPass(todayOnly)
      .catch(() => {})
      .finally(() => {
        running = false;
        const next = queued;
        queued = null;
        if (next) start(next.todayOnly);
      });
  }

  function armMidnight(): void {
    midnight = clearTimer(midnight);
    midnight = setTimeout(() => {
      midnight = null;
      start(false);
      armMidnight();
    }, msUntilNextMidnight() + MIDNIGHT_GRACE_MS);
  }

  function request(req: LockRenderRequest): Promise<void> {
    if (!inputs || appState === 'background') return Promise.resolve();
    const todayIsCurrent =
      todayLive?.version === version && todayLive.todayISO === getTodayISO() && getLockRenderState().todayReady;
    if (req.priority === 'today' && todayIsCurrent) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const waiter: Waiter = {
        priority: req.priority,
        resolve,
        timer: setTimeout(() => settle(waiter), WAITER_TIMEOUT_MS),
      };
      waiters.add(waiter);
      start(false);
    });
  }

  function setInputs(next: HostInputs | null): void {
    const wasActive = inputs != null;
    inputs = next;
    version += 1;
    if (!next) {
      if (wasActive) deactivate();
      return;
    }
    // Until a pass has looked at these inputs, today's live picture may
    // predate them, so "Save today's picture" and friends must wait for it.
    // A pass that finds today unchanged sets it straight back.
    if (wasActive) _setLockRenderState({ todayReady: false });
    debounce = clearTimer(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      start(false);
    }, INPUT_DEBOUNCE_MS);
    if (!wasActive) {
      armMidnight();
      // Last: registering hands over any request queued before the host could
      // render, and serving it cancels the debounce above.
      unregister = _registerRenderHost(request);
    }
  }

  function deactivate(): void {
    epoch += 1;
    unregister?.();
    unregister = null;
    queued = null;
    debounce = clearTimer(debounce);
    retry = clearTimer(retry);
    midnight = clearTimer(midnight);
    errorStreak = 0;
    todayLive = null;
    // Lets a pass waiting on the canvas notice it has been cancelled.
    pendingReady?.resolve();
    pendingReady = null;
    settleWaiters('all');
    mount(null);
    _setLockRenderState({ phase: 'idle', done: 0, total: 0, todayReady: false });
  }

  function handleAppState(next: AppStateStatus): void {
    appState = next;
    if (next === 'background') {
      // A running pass stops after its in-flight capture (see runPass).
      dirty = true;
      return;
    }
    if (!inputs) return;
    if (next === 'inactive') {
      // Leaving with edits still debounced: best effort to get today's picture
      // out before an "Is Closed" automation reads it.
      if (debounce) start(true);
      return;
    }
    if (next === 'active' && (dirty || getTodayISO() !== lastPlannedToday)) start(false);
  }

  function canvasReady(id: string): void {
    if (pendingReady?.id !== id) return;
    pendingReady.resolve();
    pendingReady = null;
  }

  function canvasFailed(id: string, error: unknown): void {
    canvasError = { id, error };
    if (pendingReady?.id !== id) return;
    pendingReady.reject(error);
    pendingReady = null;
  }

  /** Mounts one picture, waits for it to be drawn and snaps it. null = the pass was cancelled meanwhile. */
  async function capture(
    plan: Plan,
    picture: PlannedPicture,
    generation: string,
    isCurrent: () => boolean,
  ): Promise<Shot | null> {
    const id = `${generation}:${picture.key}`;
    const { config, theme, darkMinimal, T } = plan.inputs;
    const ready = new Promise<void>((resolve, reject) => {
      pendingReady = { id, resolve, reject };
    });
    mount({ id, model: picture.model, config, theme, darkMinimal, T, W: plan.W, H: plan.H, s: plan.s });
    let drawn: boolean;
    try {
      drawn = await within(ready, READY_TIMEOUT_MS);
    } finally {
      if (pendingReady?.id === id) pendingReady = null;
    }
    if (!isCurrent()) return null;
    if (!wrapper.current) throw new Error('Lock screen canvas did not mount');
    // No width/height: on iOS the output is points × screen scale, the wallpaper's own size.
    const path = await captureRef(wrapper, { format: 'jpg', quality: 0.9, result: 'tmpfile' });
    if (canvasError?.id === id) {
      discardCapture(path);
      throw canvasError.error;
    }
    // Past the timeout the photo may not be on its view yet, so this can be
    // the bare backdrop behind a current panel. Good enough to serve, but
    // under the real signature it would be carried forward for days.
    const signature = drawn ? picture.signature : `${picture.signature}${DEGRADED_SUFFIX}`;
    return { path, uri: toFileUri(path), signature };
  }

  function finish(leftover: boolean): void {
    errorStreak = 0;
    dirty = leftover;
    _setLockRenderState({ phase: leftover ? 'waiting' : 'idle' });
    settleWaiters('all');
  }

  function fail(error: unknown, step: string): void {
    const message = error instanceof Error ? error.message : String(error);
    dirty = true;
    errorStreak += 1;
    _setLockRenderState({ phase: 'error', error: message });
    settleWaiters('all');
    if (errorStreak <= MAX_AUTO_RETRIES) {
      retry = setTimeout(() => {
        retry = null;
        start(false);
      }, RETRY_BASE_MS * errorStreak);
    }
    // Reporting last, so a throw in there can't cost the retry above.
    // Once per distinct failure per session: a broken capture would otherwise report on every edit.
    if (!reported.has(message)) {
      reported.add(message);
      captureError(error, { operation: 'lock_screen_render', step });
    }
    if (__DEV__) console.warn('[lockScreen] render pass failed', error);
  }

  async function runPass(todayOnly: boolean): Promise<void> {
    const snapshot = inputs;
    if (!snapshot) return;
    const passEpoch = epoch;
    const passVersion = version;
    const isCurrent = () => epoch === passEpoch;
    const pendingDays: PendingDay[] = [];
    let pendingFallback: Shot | null = null;
    let step = 'plan';

    try {
      const plan = planPictures(snapshot);
      const { todayISO } = plan;
      lastPlannedToday = todayISO;
      // Inputs that changed mid-pass make today's picture older than them, however it went.
      const upToDate = () => version === passVersion;
      const todayClean = !plan.dirty.includes(todayISO);
      if (todayClean) markTodayLive(passVersion, todayISO);
      const order = todayOnly ? plan.dirty.filter((key) => key === todayISO) : plan.dirty;

      const generation = Date.now().toString(36);
      // Today and the fallback go live together first; the rest of the week follows.
      const headCount = order.filter((key) => key === todayISO || key === FALLBACK_KEY).length;
      let live = plan.manifest;
      let done = 0;
      let degraded = false;
      let end: 'complete' | 'superseded' | 'left' = 'complete';

      const flush = () => {
        // With nothing captured there is still something to write while the
        // manifest serves a day whose model has changed (see liveHasStaleDay).
        if (pendingDays.length === 0 && !pendingFallback && !liveHasStaleDay(plan, live)) return;
        // Checked right before every write: turning auto-refresh off or signing
        // out clears the pictures, and a pass mid-capture must not put them back.
        if (!isCurrent() || !getLockScreenConfigSnapshot().autoRefresh) return;
        step = 'write';
        const written = writeLockScreenGeneration(generationInput(plan, generation, live, pendingDays, pendingFallback));
        live = written;
        pendingDays.length = 0;
        pendingFallback = null;
        const todayReady = isTodayLive(written, plan);
        _setLockRenderState({ lastWrittenAt: written.generatedAt, todayReady: todayReady && upToDate() });
        if (todayReady) markTodayLive(passVersion, todayISO);
      };

      if (order.length === 0) {
        // A today-only pass (the app is on its way out) with today current.
        // Days further out may still have changed, e.g. a task due tomorrow
        // ticked off just before leaving: nothing else writes before the
        // morning automation reads the manifest, so drop them now.
        flush();
        _setLockRenderState({ done: 0, total: 0, todayReady: upToDate() });
        finish(plan.dirty.length > 0);
        return;
      }

      _setLockRenderState({ phase: 'rendering', done: 0, total: order.length, todayReady: todayClean && upToDate() });

      for (let i = 0; i < order.length; i++) {
        if (i > 0) {
          await pace();
          if (!isCurrent()) return;
          if (!upToDate()) {
            end = 'superseded';
            break;
          }
          if (appState !== 'active') {
            end = 'left';
            break;
          }
        }
        step = 'capture';
        const picture = plan.pictures[order[i]];
        const shot = await capture(plan, picture, generation, isCurrent);
        if (!shot) return;
        if (!isCurrent()) {
          discardCapture(shot.path);
          return;
        }
        // Taken while iOS was suspending the app: it may be blank.
        if (appState === 'background') {
          discardCapture(shot.path);
          end = 'left';
          break;
        }
        if (shot.signature !== picture.signature) degraded = true;
        if (picture.key === FALLBACK_KEY) pendingFallback = shot;
        else pendingDays.push({ dateISO: picture.key, shot });
        done += 1;
        _setLockRenderState({ done });
        if (i === headCount - 1) flush();
      }

      // Captures from a superseded pass still match their own signatures, so
      // they are written too; the rerun redraws whichever ones changed.
      flush();

      if (end === 'superseded') {
        // The debounced rerun takes the new inputs, and the waiting callers with them.
        dirty = true;
        return;
      }
      finish(end === 'left' || done < plan.dirty.length);
      // A degraded shot is live but marked stale, so the next foreground
      // redraws it even if nothing else has changed by then.
      if (degraded) dirty = true;
    } catch (error) {
      if (isCurrent()) fail(error, step);
    } finally {
      for (const { shot } of pendingDays) discardCapture(shot.path);
      if (pendingFallback) discardCapture(pendingFallback.path);
      if (isCurrent()) mount(null);
    }
  }

  return {
    setInputs,
    handleAppState,
    canvasReady,
    canvasFailed,
    dispose: () => setInputs(null),
  };
}

// ─── Components ──────────────────────────────────────────────────────────────

interface CanvasBoundaryProps {
  onError: (error: unknown) => void;
  children: ReactNode;
}

/** A template that throws fails the pass instead of taking the whole app down. */
class CanvasBoundary extends Component<CanvasBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function RenderHost() {
  const { dataReady, user } = useApp();
  const theme = useTheme();
  const darkMinimal = useDarkMinimalThemePack();
  const [config, , configLoaded] = useLockScreenConfig();
  const [storeAvailable] = useState(isLockScreenStoreAvailable);

  const userId = user.id || null;
  const active = storeAvailable && configLoaded && config.autoRefresh && dataReady && userId != null;

  // Shared with the Studio preview, so what the student designs is what gets drawn.
  const modelInput = useLockScreenModelInput(active);
  const inputs = useMemo<HostInputs | null>(
    () => (modelInput ? { ...modelInput, config, theme, darkMinimal } : null),
    [modelInput, config, theme, darkMinimal],
  );

  const [job, setJob] = useState<CaptureJob | null>(null);
  const wrapperRef = useRef<View>(null);
  const [engine] = useState(() => createRenderEngine(setJob, wrapperRef));

  useEffect(() => {
    engine.setInputs(inputs);
  }, [engine, inputs]);

  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const { autoRefresh } = getLockScreenConfigSnapshot();
      // Recorded synchronously, before any later listener awaits: the Shortcuts
      // runner and the automation detector both compare against it.
      if (next === 'background' && autoRefresh) void updateLockScreenSetup({ lastBackgroundAt: Date.now() });
      if (next === 'active' && autoRefresh) void runLockScreenAutomationDetector();
      engine.handleAppState(next);
    });
    return () => subscription.remove();
  }, [engine]);

  const featureOn = configLoaded && config.autoRefresh;
  useEffect(() => {
    if (!featureOn) return;
    // Loaded up front so the background write above lands without a storage read first.
    void loadLockScreenSetup();
    // Cold start: an automation may have served a picture while Rencana was not running at all.
    void runLockScreenAutomationDetector();
    // Or the relaunch came from a run's own x-callback, after iOS killed
    // Rencana mid-run; the callback may land before or after this mounts.
    void reconcileInterruptedLockRun();
    return subscribeLockScreenCallback(() => {
      void reconcileInterruptedLockRun();
    });
  }, [featureOn]);

  // AppContext clears the pictures on sign-out, but a pass already past its
  // last check can land one more write before this render deactivates it.
  // Clearing again after the commit means no account inherits another's week.
  const previousUserRef = useRef(userId);
  useEffect(() => {
    const previous = previousUserRef.current;
    previousUserRef.current = userId;
    if (!previous || previous === userId) return;
    try {
      clearLockScreenImages();
    } catch {
      /* nothing to clear */
    }
  }, [userId]);

  const jobId = job?.id ?? null;
  const onReady = useCallback(() => {
    if (jobId) engine.canvasReady(jobId);
  }, [engine, jobId]);
  const onCanvasError = useCallback(
    (error: unknown) => {
      if (jobId) engine.canvasFailed(jobId, error);
    },
    [engine, jobId],
  );

  if (!job) return null;
  return (
    // Offscreen but still in the window, which is all captureRef needs.
    // Opacity stays 1: a transparent view would capture as transparent.
    <View
      ref={wrapperRef}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: -(job.W + 200), top: 0, width: job.W, height: job.H }}
    >
      <CanvasBoundary key={job.id} onError={onCanvasError}>
        <LockCanvas
          model={job.model}
          config={job.config}
          W={job.W}
          H={job.H}
          s={job.s}
          theme={job.theme}
          darkMinimal={job.darkMinimal}
          T={job.T}
          forCapture
          onReady={onReady}
        />
      </CanvasBoundary>
    </View>
  );
}

/** Global renderer for the self-refreshing lock screen (iPhone only). */
export default function LockScreenRenderHost() {
  if (Platform.OS !== 'ios' || Platform.isPad) return null;
  return <RenderHost />;
}
