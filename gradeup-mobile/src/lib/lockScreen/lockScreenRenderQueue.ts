/**
 * Render state and render requests for the lock screen pictures.
 *
 * LockScreenRenderHost (mounted once in the root layout) does the drawing and
 * registers itself here. The Studio, the setup sheet and the Shortcuts runner
 * only talk to this module, so none of them needs a ref to the host and the
 * host needs no props.
 *
 * Kept free of React and native modules so any screen or library can import it
 * without pulling in the renderer.
 */

import { INITIAL_LOCK_RENDER_STATE, type LockRenderState } from './types';

/** 'today' = settle as soon as today's picture is live; 'all' = every dirty day. */
export type LockRenderPriority = 'today' | 'all';

export interface LockRenderRequest {
  priority: LockRenderPriority;
  /** Free-form tag for debugging, e.g. 'setup' or 'not-ready-retry'. */
  reason?: string;
}

/**
 * The host's entry point. It should settle once the request is served (today
 * live for 'today', every dirty day written for 'all'), and settle promptly if
 * it cannot render right now rather than hang.
 */
export type LockRenderHandler = (request: LockRenderRequest) => Promise<void>;

type StateListener = (state: LockRenderState) => void;

interface QueuedWaiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

interface QueuedBatch {
  request: LockRenderRequest;
  waiters: QueuedWaiter[];
}

/**
 * How long a request waits for a host to register. The host registers only
 * while it can render (config loaded, auto-refresh on, data ready), which on a
 * cold start can take a few seconds of network — and never happens on Android,
 * iPad or with auto-refresh off, where the request just resolves.
 */
const QUEUED_REQUEST_TIMEOUT_MS = 20_000;

let state: LockRenderState = INITIAL_LOCK_RENDER_STATE;
const stateListeners = new Set<StateListener>();

let host: LockRenderHandler | null = null;
let queued: QueuedBatch | null = null;

const STATE_KEYS: (keyof LockRenderState)[] = ['phase', 'done', 'total', 'lastWrittenAt', 'todayReady', 'error'];

function emitState(): void {
  for (const listener of [...stateListeners]) {
    try {
      listener(state);
    } catch {
      /* a broken subscriber must not stop the others */
    }
  }
}

/** Stable reference between changes, so it works with `useSyncExternalStore`. */
export function getLockRenderState(): LockRenderState {
  return state;
}

export function subscribeLockRenderState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Host only. Merges `patch`; `error` is dropped whenever the phase is not 'error'. */
export function _setLockRenderState(patch: Partial<LockRenderState>): void {
  const next: LockRenderState = { ...state, ...patch };
  if (next.phase !== 'error') next.error = undefined;
  if (STATE_KEYS.every((key) => next[key] === state[key])) return;
  state = next;
  emitState();
}

// Failures surface through the render state (phase 'error'); a caller only
// needs to know the attempt is over, so the returned promise never rejects.
function callHost(handler: LockRenderHandler, request: LockRenderRequest): Promise<void> {
  try {
    return handler(request).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

function mergeRequests(a: LockRenderRequest, b: LockRenderRequest): LockRenderRequest {
  return {
    priority: a.priority === 'all' || b.priority === 'all' ? 'all' : 'today',
    reason: b.reason ?? a.reason,
  };
}

/**
 * Asks the host to (re)draw. Resolves when the host has served the request.
 *
 * With no host registered yet, requests are merged into one ('all' wins) and
 * handed over as soon as a host registers; each caller's promise resolves when
 * that run settles, or after QUEUED_REQUEST_TIMEOUT_MS if no host shows up.
 * Never rejects — check `getLockRenderState()` or `whenLockScreenTodayReady()`
 * for the result.
 */
export function requestLockScreenRender(opts?: { priority?: LockRenderPriority; reason?: string }): Promise<void> {
  const request: LockRenderRequest = { priority: opts?.priority ?? 'all', reason: opts?.reason };
  if (host) return callHost(host, request);

  return new Promise<void>((resolve) => {
    const batch: QueuedBatch = queued ?? { request, waiters: [] };
    if (queued) batch.request = mergeRequests(batch.request, request);
    queued = batch;
    const waiter: QueuedWaiter = {
      resolve,
      timer: setTimeout(() => {
        batch.waiters = batch.waiters.filter((w) => w !== waiter);
        if (queued === batch && batch.waiters.length === 0) queued = null;
        resolve();
      }, QUEUED_REQUEST_TIMEOUT_MS),
    };
    batch.waiters.push(waiter);
  });
}

/**
 * Host only. Registers the render entry point and hands it any queued request.
 * Returns an unregister function; register only while able to render, so early
 * requests wait for a host that can actually serve them.
 */
export function _registerRenderHost(handler: LockRenderHandler): () => void {
  host = handler;
  const batch = queued;
  if (batch) {
    queued = null;
    for (const waiter of batch.waiters) clearTimeout(waiter.timer);
    void callHost(handler, batch.request).then(() => {
      for (const waiter of batch.waiters) waiter.resolve();
    });
  }
  return () => {
    if (host === handler) host = null;
  };
}

/**
 * Resolves true once today's picture is live, false after `timeoutMs` or when a
 * render fails. Only a failure that happens after the call counts, so an error
 * left over from an earlier run does not short-circuit a fresh request.
 */
export function whenLockScreenTodayReady(timeoutMs = 20_000): Promise<boolean> {
  if (state.todayReady) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let lastPhase = state.phase;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      resolve(ready);
    };

    unsubscribe = subscribeLockRenderState((next) => {
      if (next.todayReady) finish(true);
      else if (next.phase === 'error' && lastPhase !== 'error') finish(false);
      lastPhase = next.phase;
    });
    timer = setTimeout(() => finish(false), timeoutMs);
  });
}
