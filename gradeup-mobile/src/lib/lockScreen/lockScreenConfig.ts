import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { scopedKey } from '@/src/lib/scopedStorage';
import {
  DEFAULT_LOCK_SCREEN_CONFIG,
  DEFAULT_LOCK_SCREEN_SETUP,
  type LockBackgroundId,
  type LockDim,
  type LockPanelStyle,
  type LockScreenConfig,
  type LockScreenSetupState,
  type LockSize,
  type LockTemplateId,
  type LockTopPreset,
} from './types';

/**
 * Lock screen settings, kept in memory once read so the render host, the
 * Studio and the setup sheet share one copy without prop drilling.
 *
 *   config  per user    `lock_screen_config_v1:<userId>`  what the pictures look like
 *   setup   per device  `lock_screen_setup_v1`            how far the Shortcuts setup got
 *
 * Setup is per device because the shortcut and its automations belong to the
 * phone, not to whoever is signed in to Rencana.
 *
 * After the first read the in-memory copy is the source of truth and every
 * change goes through this module: re-reading storage while a write is still
 * queued would bring old values back.
 */

export const LOCK_SCREEN_CONFIG_KEY = 'lock_screen_config_v1';
export const LOCK_SCREEN_SETUP_KEY = 'lock_screen_setup_v1';

/**
 * Picked photos are copied here; the picker's own URI is a temp file. The web
 * has no documents directory (expo-file-system's classes throw there), so a
 * web photo is the picker's blob: URL, good for as long as the page lives.
 */
const PHOTO_DIRECTORY_NAME = 'lock-screen-bg';
const IS_WEB = Platform.OS === 'web';

type ConfigListener = (config: LockScreenConfig) => void;
type SetupListener = (setup: LockScreenSetupState) => void;
type SetupPatch = Partial<LockScreenSetupState>;

// ─── Validation ──────────────────────────────────────────────────────────────

const TEMPLATES: readonly LockTemplateId[] = ['today', 'week', 'glance'];
const BACKGROUNDS: readonly LockBackgroundId[] = [
  'dusk',
  'lagoon',
  'matcha',
  'peach',
  'midnight',
  'aurora',
  'graphite',
  'sakura',
  'theme',
  'photo',
];
const DIMS: readonly LockDim[] = [0, 1, 2];
const PANELS: readonly LockPanelStyle[] = ['dark', 'light'];
const TOPS: readonly LockTopPreset[] = ['standard', 'widgets', 'bigClock', 'compact'];
const SIZES: readonly LockSize[] = ['short', 'medium', 'tall'];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function timestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Field by field, so one bad value (an old build, a hand-edited backup) costs only that field. */
function sanitizeConfig(raw: unknown): LockScreenConfig {
  const r = asRecord(raw);
  const show = asRecord(r.show);
  const d = DEFAULT_LOCK_SCREEN_CONFIG;
  const photoPath = typeof r.photoPath === 'string' && r.photoPath.length > 0 ? r.photoPath : null;
  const background = oneOf(r.background, BACKGROUNDS, d.background);
  const topFrac =
    typeof r.topFrac === 'number' && Number.isFinite(r.topFrac) && r.topFrac > 0 && r.topFrac < 1 ? r.topFrac : null;
  return {
    version: 1,
    template: oneOf(r.template, TEMPLATES, d.template),
    background: background === 'photo' && !photoPath ? d.background : background,
    photoPath,
    dim: oneOf(r.dim, DIMS, d.dim),
    panel: oneOf(r.panel, PANELS, d.panel),
    top: oneOf(r.top, TOPS, d.top),
    topFrac,
    size: oneOf(r.size, SIZES, d.size),
    show: {
      tasks: bool(show.tasks, d.show.tasks),
      rooms: bool(show.rooms, d.show.rooms),
      weekNo: bool(show.weekNo, d.show.weekNo),
    },
    autoRefresh: bool(r.autoRefresh, d.autoRefresh),
  };
}

function sanitizeSetup(raw: unknown): LockScreenSetupState {
  const r = asRecord(raw);
  const fails = r.wallpaperFailCount;
  return {
    shortcutOpenedAt: timestamp(r.shortcutOpenedAt),
    shortcutStepDoneAt: timestamp(r.shortcutStepDoneAt),
    firstRunVerifiedAt: timestamp(r.firstRunVerifiedAt),
    completedAt: timestamp(r.completedAt),
    lastManualRunAt: timestamp(r.lastManualRunAt),
    lastBackgroundAt: timestamp(r.lastBackgroundAt),
    automationConfirmedAt: timestamp(r.automationConfirmedAt),
    closeAutomationConfirmedAt: timestamp(r.closeAutomationConfirmedAt),
    automationBannerPending: r.automationBannerPending === true,
    wallpaperFailCount: typeof fails === 'number' && Number.isFinite(fails) && fails > 0 ? Math.floor(fails) : 0,
  };
}

/** Both shapes come out of the sanitizers with a fixed key order, so JSON equality is exact. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function emit<T>(listeners: Set<(value: T) => void>, value: T): void {
  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch {
      /* a broken subscriber must not stop the others */
    }
  }
}

// ─── Storage ─────────────────────────────────────────────────────────────────

// One chain for every write, so two quick saves land in the order they were made.
let writeChain: Promise<void> = Promise.resolve();

function persist(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  writeChain = writeChain
    .then(() => AsyncStorage.setItem(key, json))
    .catch((error) => {
      if (__DEV__) console.warn('[lockScreen] could not save settings', error);
    });
  return writeChain;
}

async function readJson(key: string): Promise<unknown> {
  // A write queued for this key (e.g. just before an account switch) must land first.
  await writeChain;
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Photo ───────────────────────────────────────────────────────────────────

function photoDirectory(): Directory {
  return new Directory(Paths.document, PHOTO_DIRECTORY_NAME);
}

function isInPhotoDirectory(path: string): boolean {
  const root = photoDirectory().uri.replace(/\/+$/, '');
  return path.startsWith(`${root}/`);
}

/**
 * iOS can move the app's data container to a new absolute path when the app is
 * updated, so a stored file:// URI may point into a folder that no longer
 * exists while the photo sits in our folder under the same name. Returns the
 * URI that exists now, or null if the photo is really gone.
 */
function resolvePhotoPath(path: string): string | null {
  // A blob: URL from an earlier page load is gone; say so rather than draw nothing.
  if (IS_WEB) return null;
  try {
    if (new File(path).exists) return path;
    const name = path.split('/').pop();
    if (!name) return null;
    const moved = new File(photoDirectory(), name);
    return moved.exists ? moved.uri : null;
  } catch {
    return null;
  }
}

function deletePhotoQuietly(path: string): void {
  if (IS_WEB || !isInPhotoDirectory(path)) return;
  try {
    const file = new File(path);
    if (file.exists) file.delete();
  } catch {
    /* an orphaned photo only costs disk space */
  }
}

export function lockScreenPhotoExists(path: string | null): boolean {
  if (!path) return false;
  // Can't be checked on the web; an unreadable one still falls back to Dusk in LockBackground.
  if (IS_WEB) return true;
  try {
    return new File(path).exists;
  } catch {
    return false;
  }
}

/**
 * Copies a picked photo to Paths.document/lock-screen-bg/<timestamp>.jpg and
 * deletes `previous` if it lives there. Returns the new file:// URI; throws if
 * the copy fails, leaving `previous` untouched. On the web, returns
 * `pickedUri` as it is (see PHOTO_DIRECTORY_NAME).
 */
export async function persistLockScreenPhoto(pickedUri: string, previous: string | null): Promise<string> {
  if (IS_WEB) return pickedUri;
  const directory = photoDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const target = new File(directory, `${Date.now()}.jpg`);
  // copy() throws when the destination exists.
  if (target.exists) target.delete();
  new File(pickedUri).copy(target);
  if (previous && previous !== target.uri) deletePhotoQuietly(previous);
  return target.uri;
}

// ─── Config (per user) ───────────────────────────────────────────────────────

/** Scoped key the snapshot belongs to; null until the first load lands. */
let configKey: string | null = null;
let configSnapshot: LockScreenConfig = DEFAULT_LOCK_SCREEN_CONFIG;
let configLoad: { key: string; promise: Promise<LockScreenConfig> } | null = null;
let photoMissing = false;
const configListeners = new Set<ConfigListener>();

function setConfigSnapshot(config: LockScreenConfig): void {
  configSnapshot = config;
  emit(configListeners, config);
}

interface ConfigRead {
  config: LockScreenConfig;
  /** The stored config needed fixing (photo moved or gone) and should be written back. */
  repaired: boolean;
  photoMissing: boolean;
}

/** Reads and sanitizes a stored config, then checks its photo is still on disk. */
async function readConfig(key: string): Promise<ConfigRead> {
  const stored = sanitizeConfig(await readJson(key));
  if (!stored.photoPath) return { config: stored, repaired: false, photoMissing: false };

  const live = resolvePhotoPath(stored.photoPath);
  if (live === stored.photoPath) return { config: stored, repaired: false, photoMissing: false };
  if (live) return { config: { ...stored, photoPath: live }, repaired: true, photoMissing: false };

  const usedPhoto = stored.background === 'photo';
  return {
    config: {
      ...stored,
      photoPath: null,
      background: usedPhoto ? DEFAULT_LOCK_SCREEN_CONFIG.background : stored.background,
    },
    repaired: true,
    photoMissing: usedPhoto,
  };
}

/**
 * The signed-in user's config, merged over the defaults. Loads once per user
 * and then answers from memory; switching users loads the new user's config
 * and notifies subscribers when it lands.
 *
 * If the saved photo no longer exists the background falls back to Dusk and
 * `consumeLockScreenPhotoMissing()` returns true once, for the Studio notice.
 */
export async function loadLockScreenConfig(userId: string | null): Promise<LockScreenConfig> {
  const key = scopedKey(LOCK_SCREEN_CONFIG_KEY, userId);
  if (configKey === key) return configSnapshot;
  if (configLoad?.key === key) return configLoad.promise;

  const promise: Promise<LockScreenConfig> = readConfig(key).then((result) => {
    // A later load (another account) supersedes this one; only the latest becomes the snapshot.
    // The repair is written back only here, together with the notice, so a
    // superseded load can't fix the photo silently and lose the notice.
    if (configLoad?.promise === promise) {
      configLoad = null;
      configKey = key;
      photoMissing = result.photoMissing;
      setConfigSnapshot(result.config);
      if (result.repaired) void persist(key, result.config);
    }
    return result.config;
  });
  configLoad = { key, promise };
  return promise;
}

/** True once `loadLockScreenConfig(userId)` has landed and the snapshot is that user's. */
export function isLockScreenConfigLoadedFor(userId: string | null): boolean {
  return configKey === scopedKey(LOCK_SCREEN_CONFIG_KEY, userId);
}

/**
 * Merges `patch`, updates the snapshot and notifies subscribers right away (so
 * a drag or a toggle feels instant), then persists. Resolves once written.
 */
export async function saveLockScreenConfig(
  userId: string | null,
  patch: Partial<LockScreenConfig>,
): Promise<LockScreenConfig> {
  const key = scopedKey(LOCK_SCREEN_CONFIG_KEY, userId);
  const loaded = await loadLockScreenConfig(userId);
  const isCurrent = configKey === key;
  const previous = isCurrent ? configSnapshot : loaded;
  const next = sanitizeConfig({
    ...previous,
    ...patch,
    show: { ...previous.show, ...patch.show },
  });
  if (sameJson(previous, next)) return previous;

  if (isCurrent) setConfigSnapshot(next);
  const written = persist(key, next);

  // "Remove photo" leaves nothing referencing the file; persistLockScreenPhoto
  // cleans up on "Change photo".
  if (previous.photoPath && !next.photoPath) deletePhotoQuietly(previous.photoPath);

  // Health counts "waiting for the first update" from completedAt. On a phone
  // that finished setup long ago, turning auto-refresh back on would otherwise
  // read as stale until the next morning's automation.
  if (!previous.autoRefresh && next.autoRefresh) {
    const setup = await loadLockScreenSetup();
    if (setup.completedAt != null) await updateLockScreenSetup({ completedAt: Date.now() });
  }

  await written;
  return next;
}

/** The last loaded user's config (defaults before any load). Stable between changes. */
export function getLockScreenConfigSnapshot(): LockScreenConfig {
  return configSnapshot;
}

export function subscribeLockScreenConfig(listener: ConfigListener): () => void {
  configListeners.add(listener);
  return () => {
    configListeners.delete(listener);
  };
}

/**
 * True once after a load found the saved photo gone and switched to Dusk. The
 * Studio reads it after its config has loaded to show lsBgPhotoMissing; the
 * render host never reads it, so the notice survives until the Studio opens.
 */
export function consumeLockScreenPhotoMissing(): boolean {
  const missing = photoMissing;
  photoMissing = false;
  return missing;
}

/**
 * Removes what this device keeps for `userId`: their saved design and the
 * copy of their photo. For account deletion: sign-out keeps both on purpose
 * (signing back in brings the design back), but a deleted account's uid never
 * signs in again, so nothing else would ever read or clean them up.
 */
export async function purgeLockScreenUserData(userId: string): Promise<void> {
  const key = scopedKey(LOCK_SCREEN_CONFIG_KEY, userId);
  const stored = sanitizeConfig(await readJson(key));
  const photo = configKey === key ? configSnapshot.photoPath : stored.photoPath;
  const live = photo ? resolvePhotoPath(photo) : null;
  if (live) deletePhotoQuietly(live);
  // A load still in flight for this user must not bring the design back.
  if (configLoad?.key === key) configLoad = null;
  if (configKey === key) {
    configKey = null;
    photoMissing = false;
    setConfigSnapshot(DEFAULT_LOCK_SCREEN_CONFIG);
  }
  writeChain = writeChain
    .then(() => AsyncStorage.removeItem(key))
    .catch((error) => {
      if (__DEV__) console.warn('[lockScreen] could not remove settings', error);
    });
  await writeChain;
}

// ─── Setup state (per device) ────────────────────────────────────────────────

let setupSnapshot: LockScreenSetupState = DEFAULT_LOCK_SCREEN_SETUP;
let setupLoaded = false;
let setupLoad: Promise<LockScreenSetupState> | null = null;
const setupListeners = new Set<SetupListener>();

export async function loadLockScreenSetup(): Promise<LockScreenSetupState> {
  if (setupLoaded) return setupSnapshot;
  if (!setupLoad) {
    setupLoad = readJson(LOCK_SCREEN_SETUP_KEY).then((raw) => {
      setupLoad = null;
      setupLoaded = true;
      setupSnapshot = sanitizeSetup(raw);
      emit(setupListeners, setupSnapshot);
      return setupSnapshot;
    });
  }
  return setupLoad;
}

export function isLockScreenSetupLoaded(): boolean {
  return setupLoaded;
}

/**
 * Merges `patch` (or the result of `patch(current)`, for read-modify-write
 * such as incrementing wallpaperFailCount), notifies, then persists.
 */
export async function updateLockScreenSetup(
  patch: SetupPatch | ((current: LockScreenSetupState) => SetupPatch),
): Promise<LockScreenSetupState> {
  await loadLockScreenSetup();
  // Read and write the snapshot in the same tick so concurrent updates can't interleave.
  const current = setupSnapshot;
  const next = sanitizeSetup({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) });
  if (sameJson(current, next)) return current;
  setupSnapshot = next;
  emit(setupListeners, next);
  await persist(LOCK_SCREEN_SETUP_KEY, next);
  return next;
}

/** Defaults until `loadLockScreenSetup()` lands. Stable between changes. */
export function getLockScreenSetupSnapshot(): LockScreenSetupState {
  return setupSnapshot;
}

export function subscribeLockScreenSetup(listener: SetupListener): () => void {
  setupListeners.add(listener);
  return () => {
    setupListeners.delete(listener);
  };
}
