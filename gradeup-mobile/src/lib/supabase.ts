import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { LogBox } from 'react-native';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY in app.config.js or .env');
}

/**
 * Persist auth session on device so refresh / cold start stays logged into Rencana.
 * Without storage, RN treats sessions as ephemeral and timetable + university data never reload.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let authRecoveryPromise: Promise<void> | null = null;

function isInvalidRefreshTokenError(message: string): boolean {
  return /invalid refresh token|refresh token not found|jwt expired|invalid jwt/i.test(message);
}

async function clearPersistedSupabaseAuthKeys(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const authKeys = keys.filter((k) => /sb-.*-auth-token/i.test(k));
  if (authKeys.length > 0) {
    await AsyncStorage.multiRemove(authKeys);
  }
}

/**
 * Handles stale/invalid refresh tokens left in device storage.
 * Without this, Supabase may repeatedly log "Invalid Refresh Token"
 * and auth boot can get stuck in noisy error loops.
 */
export async function recoverSupabaseAuthState(): Promise<void> {
  if (authRecoveryPromise) return authRecoveryPromise;
  authRecoveryPromise = (async () => {
    try {
      const { error } = await supabase.auth.getSession();
      if (error && isInvalidRefreshTokenError(error.message || '')) {
        await supabase.auth.signOut({ scope: 'local' });
        await clearPersistedSupabaseAuthKeys();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isInvalidRefreshTokenError(msg)) {
        await supabase.auth.signOut({ scope: 'local' });
        await clearPersistedSupabaseAuthKeys();
      }
    }
  })().finally(() => {
    authRecoveryPromise = null;
  });
  return authRecoveryPromise;
}

if (__DEV__) {
  LogBox.ignoreLogs([
    'AuthApiError: Invalid Refresh Token: Refresh Token Not Found',
  ]);
}

void recoverSupabaseAuthState();
