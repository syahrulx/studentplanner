/**
 * Smart Capture inbox — a single-slot, dependency-free module store.
 *
 * Everything that can start a capture (share sheet, iOS Back Tap App Intent,
 * in-app paste, in-app image picker) drops a request here. `SmartCaptureLauncher`
 * subscribes and opens `/smart-capture` once the app is actually ready
 * (navigation mounted, session restored, remote data loaded, not stuck in the
 * `(auth)` gate).
 *
 * IMPORTANT: this module must not import React or react-native. It is pulled in
 * by `app/+native-intent.ts`, which expo-router evaluates while building the
 * linking config — before the root layout mounts.
 */

export type CaptureSource = 'share' | 'back_tap' | 'paste' | 'picker';

export interface CaptureRequest {
  id: string;
  source: CaptureSource;
  /** Present for `paste` (typed by the user in the AI planner sheet). */
  text?: string;
  /** Present for `picker` (a local image URI chosen from the library). */
  imageUri?: string;
  receivedAt: number;
}

/** Captures older than this are dropped rather than surprising the user later. */
export const CAPTURE_MAX_AGE_MS = 15 * 60 * 1000;

/** Waiting to be shown. Set by whoever received the capture. */
let pending: CaptureRequest | null = null;
/** Currently being reviewed in the Smart Capture sheet. */
let active: CaptureRequest | null = null;
let lastConsumedShareKey: string | null = null;
const listeners = new Set<() => void>();

let counter = 0;
function nextId(): string {
  counter += 1;
  return `cap_${Date.now().toString(36)}_${counter}`;
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* a bad subscriber must not break the others */
    }
  }
}

export function enqueueCapture(
  request: Omit<CaptureRequest, 'id' | 'receivedAt'> & { id?: string; receivedAt?: number },
): CaptureRequest {
  const next: CaptureRequest = {
    id: request.id ?? nextId(),
    source: request.source,
    text: request.text,
    imageUri: request.imageUri,
    receivedAt: request.receivedAt ?? Date.now(),
  };
  pending = next;
  emit();
  return next;
}

/** Reads the pending request without clearing it. Stable reference for `useSyncExternalStore`. */
export function peekCapture(): CaptureRequest | null {
  return pending;
}

/**
 * Moves the pending request into the active slot and returns it.
 *
 * The launcher promotes before navigating and the sheet reads the active slot
 * on mount, so the payload survives the hop — route params only carry ids.
 */
export function promoteCapture(): CaptureRequest | null {
  const current = pending;
  if (!current) return active;
  pending = null;
  active = current;
  emit();
  return current;
}

/** The capture the Smart Capture sheet is currently working on. */
export function getActiveCapture(): CaptureRequest | null {
  return active;
}

/**
 * Called by the sheet when it closes, so a capture it already showed is never
 * re-shown. `handledId` guards the case where a new capture was promoted in the
 * same tick the sheet unmounted: clearing blindly would throw that one away and
 * the launcher, having already skipped its push, would never bring it back.
 */
export function clearActiveCapture(handledId?: string): void {
  if (!active) return;
  if (handledId != null && active.id !== handledId) {
    // A newer capture is waiting. Put it back in the pending slot so the
    // launcher opens the sheet again for it.
    pending = active;
    active = null;
    emit();
    return;
  }
  active = null;
  emit();
}

export function clearCapture(): void {
  if (pending || active) {
    pending = null;
    active = null;
    emit();
  }
}

export function subscribeCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isCaptureStale(request: CaptureRequest, now = Date.now()): boolean {
  return now - request.receivedAt > CAPTURE_MAX_AGE_MS;
}

/** Drops the pending capture when it has aged out. Returns true when it did. */
export function takeCaptureIfStale(now = Date.now()): boolean {
  if (!pending || !isCaptureStale(pending, now)) return false;
  pending = null;
  emit();
  return true;
}

/**
 * expo-sharing keeps its payload in native storage until `clearSharedPayloads()`
 * runs, so a foreground probe would re-enqueue the same share forever. We
 * remember the fingerprint of the last share we consumed and skip it.
 */
export function getLastConsumedShareKey(): string | null {
  return lastConsumedShareKey;
}

export function setLastConsumedShareKey(key: string | null): void {
  lastConsumedShareKey = key;
}

/** Fingerprint for a set of raw share payloads (`value|mimeType|shareType`). */
export function shareKeyOf(
  payloads: { value: string; mimeType?: string; shareType: string }[],
): string {
  return payloads.map((p) => `${p.value}|${p.mimeType ?? ''}|${p.shareType}`).join('~~');
}
