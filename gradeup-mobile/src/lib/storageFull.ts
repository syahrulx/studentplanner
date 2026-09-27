/**
 * Detects a device that has run out of storage, so the app can say so instead
 * of losing the user's work in silence.
 *
 * Every write in storage.ts swallows its error. That is right for a one-off
 * failure, but a full disk is not one-off: it fails for every write from then
 * on. The user keeps editing, nothing is saved, and on the next launch their
 * work is gone with no explanation — which reads as "the app lost my data"
 * rather than "my phone is full".
 */

type Listener = (full: boolean) => void;

const listeners = new Set<Listener>();
let storageFull = false;

/**
 * True for "no space left on device".
 *
 * iOS reports NSPOSIXErrorDomain code 28 (ENOSPC), usually wrapped in
 * NSCocoaErrorDomain 640, and Android surfaces ENOSPC in the message. The
 * error arrives across a native bridge, so it may be an Error, a plain object
 * or a string — match on the text of whatever we are handed.
 */
export function isOutOfSpaceError(error: unknown): boolean {
  if (!error) return false;
  const text = typeof error === 'string'
    ? error
    : `${(error as { message?: string })?.message ?? ''} ${String(error)}`;
  if (!text) return false;
  return /no space left on device|out of space|ENOSPC|Code=28\b/i.test(text);
}

/**
 * Call from a storage write's catch block. Anything that is not a full disk is
 * ignored, so ordinary transient failures stay silent as before.
 */
export function reportStorageError(error: unknown): void {
  if (storageFull || !isOutOfSpaceError(error)) return;
  storageFull = true;
  listeners.forEach((listener) => {
    try { listener(true); } catch {}
  });
}

/** Cleared when a write succeeds again, so the banner goes once space is freed. */
export function reportStorageWriteOk(): void {
  if (!storageFull) return;
  storageFull = false;
  listeners.forEach((listener) => {
    try { listener(false); } catch {}
  });
}

export function isStorageFull(): boolean {
  return storageFull;
}

/**
 * Try a tiny write to see whether space has been freed. Used by the banner's
 * "Check again", because nothing else tells us the user has deleted photos —
 * the flag would otherwise stay set until the app restarts.
 */
export async function recheckStorage(): Promise<boolean> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('__storage_space_probe', '1');
    await AsyncStorage.removeItem('__storage_space_probe');
    reportStorageWriteOk();
    return true;
  } catch (error) {
    reportStorageError(error);
    return false;
  }
}

export function subscribeStorageFull(listener: Listener): () => void {
  listeners.add(listener);
  listener(storageFull);
  return () => { listeners.delete(listener); };
}
