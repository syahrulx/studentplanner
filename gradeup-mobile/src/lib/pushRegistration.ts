import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * What we last wrote to `profiles` for this device, so a cold start does not
 * re-write a row that already holds exactly these values.
 *
 * This used to run unconditionally on every launch — and from two call sites —
 * so each app open issued redundant UPDATEs against the user's profiles row.
 * That row is shared with the `last_active_at` bump, and concentrated writes on
 * a single row are what turns a busy period into lock contention.
 */
const PUSH_SYNC_CACHE_KEY = 'push_token_sync_v1';

/**
 * How long a successful sync is trusted before we re-check. Rotation does not
 * wait for this: `subscribeExpoPushTokenUpdates` writes through as soon as Expo
 * issues a new token, so this only bounds drift from a write we never saw fail.
 */
const PUSH_SYNC_RECHECK_MS = 24 * 60 * 60 * 1000;

type PushSyncCache = {
  userId: string;
  token: string;
  platform: string | null;
  syncedAt: number;
};

async function readSyncCache(): Promise<PushSyncCache | null> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_SYNC_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PushSyncCache>;
    if (typeof parsed?.userId !== 'string' || typeof parsed?.token !== 'string') return null;
    return {
      userId: parsed.userId,
      token: parsed.token,
      platform: typeof parsed.platform === 'string' ? parsed.platform : null,
      syncedAt: typeof parsed.syncedAt === 'number' ? parsed.syncedAt : 0,
    };
  } catch {
    return null;
  }
}

async function writeSyncCache(entry: PushSyncCache): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_SYNC_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // A cache miss next launch only costs one redundant write.
  }
}

function currentPlatform(): string | null {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
}

/** Obtain Expo push token and store on the signed-in user's profile (for remote push via Expo). */
export async function syncExpoPushTokenToProfile(userId: string): Promise<void> {
  if (Platform.OS === 'web' || !userId) return;
  const platform = currentPlatform();

  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;

    const cached = await readSyncCache();

    // Nothing has changed and the last write is recent — skip the Expo token
    // fetch as well as the database write.
    if (
      cached &&
      cached.userId === userId &&
      cached.platform === platform &&
      Date.now() - cached.syncedAt < PUSH_SYNC_RECHECK_MS
    ) {
      return;
    }

    const projectId = getExpoProjectId();
    if (!projectId) {
      if (__DEV__) console.warn('[push] EAS projectId missing — set extra.eas.projectId in app.config.js');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    // Past the recheck window but the values still match: refresh the local
    // timestamp and leave the row alone.
    if (cached && cached.userId === userId && cached.token === token && cached.platform === platform) {
      await writeSyncCache({ userId, token, platform, syncedAt: Date.now() });
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        expo_push_token: token,
        expo_push_token_updated_at: new Date().toISOString(),
        ...(platform ? { device_platform: platform } : {}),
      })
      .eq('id', userId);

    if (error) {
      if (__DEV__) console.warn('[push] profiles update:', error.message);
      return; // Leave the cache alone so the next launch retries.
    }

    await writeSyncCache({ userId, token, platform, syncedAt: Date.now() });
  } catch (e) {
    if (__DEV__) console.warn('[push] sync skipped:', e);
  }
}

/** Re-save token when Expo rotates it (e.g. reinstall). */
export function subscribeExpoPushTokenUpdates(getUserId: () => string | null): () => void {
  const platform = currentPlatform();
  const sub = Notifications.addPushTokenListener(({ data: token }) => {
    const uid = getUserId();
    if (!uid || !token) return;
    void (async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          expo_push_token: token,
          expo_push_token_updated_at: new Date().toISOString(),
          ...(platform ? { device_platform: platform } : {}),
        })
        .eq('id', uid);
      // Keep the cache in step so the next launch does not repeat this write.
      if (!error) await writeSyncCache({ userId: uid, token, platform, syncedAt: Date.now() });
    })();
  });
  return () => sub.remove();
}
