/**
 * Hand-off for `rencana://lock-screen-callback`, the x-callback URL the
 * Shortcuts app opens after running "Rencana Lock Screen" from inside Rencana.
 *
 * app/+native-intent.ts swallows the URL (no navigation, so the setup screen
 * stays where it is) and reports the outcome here; the screen that started the
 * run listens. The real proof that the wallpaper was served is status.json,
 * written by the App Intent — this only says how the run ended.
 *
 * Kept dependency-free: +native-intent evaluates it while expo-router builds
 * its linking config, before the root layout mounts.
 */

export type LockScreenRunResult = 'success' | 'cancel' | 'error';

/**
 * The query key our x-callback URLs carry the result in. Not `result`:
 * Shortcuts appends `result=<output>` to x-success when a shortcut outputs
 * anything, which would overwrite ours.
 */
export const LOCK_SCREEN_CALLBACK_RESULT_KEY = 'rencana_result';

export interface LockScreenCallback {
  result: LockScreenRunResult;
  /** Shortcuts appends `errorMessage` to x-error, e.g. when the shortcut name does not exist. */
  errorMessage?: string;
  at: number;
}

type Listener = (callback: LockScreenCallback) => void;

const listeners = new Set<Listener>();
let last: LockScreenCallback | null = null;

export function emitLockScreenCallback(callback: Omit<LockScreenCallback, 'at'>): void {
  last = { ...callback, at: Date.now() };
  listeners.forEach((listener) => {
    try {
      listener(last as LockScreenCallback);
    } catch {
      /* a broken listener must not stop the others */
    }
  });
}

export function subscribeLockScreenCallback(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The most recent callback, for whoever mounted after it arrived (e.g. after a relaunch by the callback itself). */
export function peekLockScreenCallback(): LockScreenCallback | null {
  return last;
}

/** Parses the query of a `rencana://lock-screen-callback?...` URL. */
export function parseLockScreenCallbackQuery(query: string): Omit<LockScreenCallback, 'at'> {
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [rawKey, rawValue = ''] = pair.split('=');
    try {
      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      params[rawKey] = rawValue;
    }
  }
  const marker = params[LOCK_SCREEN_CALLBACK_RESULT_KEY];
  const result: LockScreenRunResult = marker === 'success' || marker === 'cancel' ? marker : 'error';
  return params.errorMessage ? { result, errorMessage: params.errorMessage } : { result };
}
