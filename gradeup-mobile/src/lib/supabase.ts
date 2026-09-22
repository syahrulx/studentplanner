import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { LogBox, Platform } from 'react-native';
import { requestUrl, timeoutForUrl } from './supabaseRequestTimeout';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY in app.config.js or .env');
}

/**
 * Aborts a request that has stopped making progress, so callers get a rejection
 * they can show a retry for instead of a promise that never settles. Which
 * requests are capped, and why, lives in ./supabaseRequestTimeout.
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const ms = timeoutForUrl(requestUrl(input));
  if (ms == null) return fetch(input, init);

  const controller = new AbortController();
  // A caller-supplied signal must still win — supabase-js aborts its own
  // in-flight requests through one, and swallowing that would leak sockets.
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  return fetch(input, { ...init, signal: controller.signal })
    .catch((e) => {
      // An abort reads as a generic "Aborted" error, which tells a caller
      // nothing. Name the real cause so logs and retry copy can be specific.
      if (timedOut) throw new Error(`Supabase request timed out after ${ms}ms`);
      throw e;
    })
    .finally(() => clearTimeout(timer));
};

/**
 * Persist auth session on device so refresh / cold start stays logged into Rencana.
 * Without storage, RN treats sessions as ephemeral and timetable + university data never reload.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On web, OAuth providers redirect back with the session in the URL hash, so
    // let supabase-js parse it. On native we use deep links + WebBrowser instead.
    detectSessionInUrl: Platform.OS === 'web',
  },
  global: { fetch: fetchWithTimeout },
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
