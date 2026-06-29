import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The four Live Activity types. The user picks exactly one active mode (or Off)
 * from settings; only that kind may appear on the Lock Screen / Dynamic Island.
 */
export type LiveActivityKind = 'studyTimer' | 'nextClass' | 'deadline' | 'attendance';

/** `null` = Live Activities off. */
export type LiveActivityMode = LiveActivityKind | null;

export interface LiveActivityPrefs {
  activeMode: LiveActivityMode;
}

const KEY_LIVE_ACTIVITY_PREFS = 'liveActivityPrefs_v2';
const KEY_LEGACY_PREFS = 'liveActivityPrefs_v1';

const KIND_PRIORITY: LiveActivityKind[] = ['studyTimer', 'attendance', 'nextClass', 'deadline'];

export const DEFAULT_LIVE_ACTIVITY_PREFS: LiveActivityPrefs = {
  activeMode: 'studyTimer',
};

function isLiveActivityKind(value: unknown): value is LiveActivityKind {
  return (
    value === 'studyTimer' ||
    value === 'nextClass' ||
    value === 'deadline' ||
    value === 'attendance'
  );
}

function migrateLegacyPrefs(raw: string): LiveActivityPrefs {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if ('activeMode' in parsed) {
      const mode = parsed.activeMode;
      return { activeMode: mode === null ? null : isLiveActivityKind(mode) ? mode : 'studyTimer' };
    }
    for (const kind of KIND_PRIORITY) {
      if (parsed[kind] === true) {
        return { activeMode: kind };
      }
    }
    return { activeMode: null };
  } catch {
    return { ...DEFAULT_LIVE_ACTIVITY_PREFS };
  }
}

export async function getLiveActivityPrefs(): Promise<LiveActivityPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY_LIVE_ACTIVITY_PREFS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LiveActivityPrefs>;
      const mode = parsed.activeMode;
      if (mode === null) return { activeMode: null };
      if (isLiveActivityKind(mode)) return { activeMode: mode };
    }
  } catch {}

  try {
    const legacy = await AsyncStorage.getItem(KEY_LEGACY_PREFS);
    if (legacy) {
      const migrated = migrateLegacyPrefs(legacy);
      await setLiveActivityPrefs(migrated);
      return migrated;
    }
  } catch {}

  return { ...DEFAULT_LIVE_ACTIVITY_PREFS };
}

export async function setLiveActivityPrefs(prefs: LiveActivityPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_LIVE_ACTIVITY_PREFS, JSON.stringify(prefs));
  } catch {}
}

export async function isLiveActivityKindEnabled(kind: LiveActivityKind): Promise<boolean> {
  const prefs = await getLiveActivityPrefs();
  return prefs.activeMode === kind;
}

export async function anyLiveActivityEnabled(): Promise<boolean> {
  const prefs = await getLiveActivityPrefs();
  return prefs.activeMode !== null;
}
