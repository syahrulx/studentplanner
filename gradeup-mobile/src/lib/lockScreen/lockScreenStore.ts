import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * The App Group files shared with the "Get lock screen image" App Intent
 * (modules/smart-capture/ios-app-target/LockScreenIntents.swift).
 *
 *   <group>/lock-screen/manifest.json               written here, last
 *   <group>/lock-screen/<YYYY-MM-DD>.<gen>.jpg      one per upcoming day
 *   <group>/lock-screen/fallback.<gen>.jpg          no "today" mark
 *   <group>/lock-screen/status.json                 written by the intent
 *
 * expo-file-system does not write atomically on iOS, so a shortcut can fire
 * mid-write. Every generation therefore uses fresh file names, the manifest is
 * swapped in only after every image is in place, and the previous generation
 * is deleted last. The intent can also find a day's image without the
 * manifest, because the date is in the file name.
 */

const APP_GROUP_ID = 'group.com.aizztech.rencana';
const DIRECTORY_NAME = 'lock-screen';
const MANIFEST_NAME = 'manifest.json';
const MANIFEST_TMP_NAME = 'manifest.next.json';
const STATUS_NAME = 'status.json';

export const LOCK_SCREEN_MANIFEST_VERSION = 1;

export interface LockScreenManifest {
  version: number;
  generatedAt: number;
  generation: string;
  /** Pixel size of every image in this generation. */
  width: number;
  height: number;
  /** Hash of every day signature in this manifest. */
  signature: string;
  /** Local date (YYYY-MM-DD) → file name in the lock-screen directory. */
  days: Record<string, string>;
  /** Local date → signature of the model that file was drawn from. */
  daySignatures: Record<string, string>;
  fallback: string | null;
  fallbackSignature: string | null;
}

/** Written by the App Intent each time a shortcut asks for today's picture. */
export interface LockScreenStatus {
  lastServedAt: number;
  servedDateISO: string;
  servedFile: string;
  usedFallback: boolean;
  count: number;
}

export interface LockScreenGenerationInput {
  generation: string;
  signature: string;
  width: number;
  height: number;
  /** Freshly captured temp files (file://) to move into the App Group. */
  days: { dateISO: string; tmpUri: string; signature: string }[];
  /**
   * Live files whose model has not changed, kept as they are. A day that is
   * neither captured nor carried is left out, so the intent serves the honest
   * fallback until that day is redrawn.
   */
  carry: { dateISO: string; file: string; signature: string }[];
  fallbackTmpUri: string | null;
  fallbackSignature: string | null;
  carryFallback: { file: string; signature: string } | null;
}

function sharedDirectory(): Directory | null {
  if (Platform.OS !== 'ios') return null;
  try {
    const container = Paths.appleSharedContainers?.[APP_GROUP_ID];
    return container ? new Directory(container, DIRECTORY_NAME) : null;
  } catch {
    return null;
  }
}

/** True on iOS builds that have the App Group entitlement. */
export function isLockScreenStoreAvailable(): boolean {
  return sharedDirectory() != null;
}

function readJson<T>(file: File): T | null {
  try {
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as T;
  } catch {
    return null;
  }
}

function deleteQuietly(entry: File | Directory): void {
  try {
    if (entry.exists) entry.delete();
  } catch {
    /* already gone, or in use — the next generation sweeps it */
  }
}

export function readLockScreenManifest(): LockScreenManifest | null {
  const dir = sharedDirectory();
  if (!dir) return null;
  const manifest = readJson<LockScreenManifest>(new File(dir, MANIFEST_NAME));
  if (!manifest || typeof manifest.days !== 'object' || manifest.days == null) return null;
  return {
    ...manifest,
    daySignatures:
      manifest.daySignatures && typeof manifest.daySignatures === 'object' ? manifest.daySignatures : {},
    fallbackSignature: typeof manifest.fallbackSignature === 'string' ? manifest.fallbackSignature : null,
  };
}

export function readLockScreenStatus(): LockScreenStatus | null {
  const dir = sharedDirectory();
  if (!dir) return null;
  const status = readJson<Partial<LockScreenStatus>>(new File(dir, STATUS_NAME));
  if (!status || typeof status.lastServedAt !== 'number') return null;
  return {
    lastServedAt: status.lastServedAt,
    servedDateISO: typeof status.servedDateISO === 'string' ? status.servedDateISO : '',
    servedFile: typeof status.servedFile === 'string' ? status.servedFile : '',
    usedFallback: status.usedFallback === true,
    count: typeof status.count === 'number' ? status.count : 1,
  };
}

/** file:// URI of the image the intent would serve for `dateISO`, for in-app previews. */
export function lockScreenImageUriFor(dateISO: string): string | null {
  const dir = sharedDirectory();
  const manifest = readLockScreenManifest();
  if (!dir || !manifest) return null;
  const name = manifest.days[dateISO] ?? manifest.fallback;
  if (!name) return null;
  const file = new File(dir, name);
  return file.exists ? file.uri : null;
}

/**
 * Moves one freshly captured generation into the App Group and makes it live.
 * Throws if the images cannot be stored; the previous generation stays live.
 */
export function writeLockScreenGeneration(input: LockScreenGenerationInput): LockScreenManifest {
  const dir = sharedDirectory();
  if (!dir) throw new Error('Lock screen storage is unavailable');
  dir.create({ intermediates: true, idempotent: true });

  const days: Record<string, string> = {};
  const daySignatures: Record<string, string> = {};
  const place = (tmpUri: string, name: string) => {
    const target = new File(dir, name);
    deleteQuietly(target);
    new File(tmpUri).move(target);
    return name;
  };
  const isLive = (name: string) => {
    try {
      return new File(dir, name).exists;
    } catch {
      return false;
    }
  };

  for (const kept of input.carry) {
    if (!isLive(kept.file)) continue;
    days[kept.dateISO] = kept.file;
    daySignatures[kept.dateISO] = kept.signature;
  }
  for (const day of input.days) {
    days[day.dateISO] = place(day.tmpUri, `${day.dateISO}.${input.generation}.jpg`);
    daySignatures[day.dateISO] = day.signature;
  }

  let fallback: string | null = null;
  let fallbackSignature: string | null = null;
  if (input.fallbackTmpUri) {
    fallback = place(input.fallbackTmpUri, `fallback.${input.generation}.jpg`);
    fallbackSignature = input.fallbackSignature;
  } else if (input.carryFallback && isLive(input.carryFallback.file)) {
    fallback = input.carryFallback.file;
    fallbackSignature = input.carryFallback.signature;
  }

  const manifest: LockScreenManifest = {
    version: LOCK_SCREEN_MANIFEST_VERSION,
    generatedAt: Date.now(),
    generation: input.generation,
    width: input.width,
    height: input.height,
    signature: input.signature,
    days,
    daySignatures,
    fallback,
    fallbackSignature,
  };

  // Written beside the live manifest, then swapped in. The intent falls back
  // to scanning file names during the instant neither exists.
  const next = new File(dir, MANIFEST_TMP_NAME);
  deleteQuietly(next);
  next.write(JSON.stringify(manifest));
  const live = new File(dir, MANIFEST_NAME);
  deleteQuietly(live);
  next.move(live);

  sweepUnreferenced(dir, manifest);
  return manifest;
}

function sweepUnreferenced(dir: Directory, manifest: LockScreenManifest): void {
  const keep = new Set<string>([
    MANIFEST_NAME,
    STATUS_NAME,
    ...Object.values(manifest.days),
    ...(manifest.fallback ? [manifest.fallback] : []),
  ]);
  try {
    for (const entry of dir.list()) {
      if (entry instanceof File && !keep.has(entry.name)) deleteQuietly(entry);
    }
  } catch {
    /* sweeping is housekeeping only */
  }
}

/**
 * Removes every picture when auto-refresh is turned off, so a leftover
 * automation cannot keep putting an old week on the lock screen. status.json
 * stays: it is history, not content.
 */
export function clearLockScreenImages(): void {
  const dir = sharedDirectory();
  if (!dir || !dir.exists) return;
  try {
    for (const entry of dir.list()) {
      if (entry instanceof File && entry.name !== STATUS_NAME) deleteQuietly(entry);
    }
  } catch {
    /* nothing to clear */
  }
}
