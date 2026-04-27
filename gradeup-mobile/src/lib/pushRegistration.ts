import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Obtain Expo push token and store on the signed-in user's profile (for remote push via Expo). */
export async function syncExpoPushTokenToProfile(userId: string): Promise<void> {
  if (Platform.OS === 'web' || !userId) return;
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const projectId = getExpoProjectId();
    if (!projectId) {
      if (__DEV__) console.warn('[push] EAS projectId missing — set extra.eas.projectId in app.config.js');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        expo_push_token: token,
        expo_push_token_updated_at: new Date().toISOString(),
        ...(platform ? { device_platform: platform } : {}),
      })
      .eq('id', userId);

    if (error && __DEV__) console.warn('[push] profiles update:', error.message);
  } catch (e) {
    if (__DEV__) console.warn('[push] sync skipped:', e);
  }
}

/** Re-save token when Expo rotates it (e.g. reinstall). */
export function subscribeExpoPushTokenUpdates(getUserId: () => string | null): () => void {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
  const sub = Notifications.addPushTokenListener(({ data: token }) => {
    const uid = getUserId();
    if (!uid || !token) return;
    void supabase
      .from('profiles')
      .update({
        expo_push_token: token,
        expo_push_token_updated_at: new Date().toISOString(),
        ...(platform ? { device_platform: platform } : {}),
      })
      .eq('id', uid);
  });
  return () => sub.remove();
}
