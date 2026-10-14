import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { reportStorageError } from './storageFull';

/**
 * Google OAuth provider tokens saved at Google sign-in (Android) so Classroom
 * can refresh its access through the `refresh-classroom-token` Edge Function.
 *
 * They include a long-lived Google refresh token, so they belong in the
 * Keychain/Keystore like the Classroom token (see getClassroomToken in
 * storage.ts), not in plaintext AsyncStorage where older builds put them.
 * SecureStore is unavailable on web, so web keeps the AsyncStorage path.
 */
const KEY = 'googleProviderTokens';
const secureStoreAvailable = Platform.OS !== 'web';

export interface GoogleProviderTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function parse(raw: string | null): GoogleProviderTokens | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : '',
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
    };
  } catch {
    return null;
  }
}

async function readSecure(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch (error) {
    reportStorageError(error);
    return null;
  }
}

/** Writes to SecureStore and reads it back. True only when the copy is really there. */
async function writeSecureVerified(raw: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(KEY, raw);
    return (await SecureStore.getItemAsync(KEY)) === raw;
  } catch (error) {
    reportStorageError(error);
    return false;
  }
}

export async function getGoogleProviderTokens(): Promise<GoogleProviderTokens | null> {
  let legacyRaw: string | null = null;
  try {
    legacyRaw = await AsyncStorage.getItem(KEY);
  } catch (error) {
    reportStorageError(error);
  }
  if (!secureStoreAvailable) return parse(legacyRaw);

  const secureRaw = await readSecure();
  const secure = parse(secureRaw);
  const legacy = parse(legacyRaw);
  if (!legacy) return secure;

  // A plaintext copy is still here: left by an older build, or by a save that
  // could not reach SecureStore. Keep whichever is newer.
  if (secure && secure.expiresAt >= legacy.expiresAt) {
    try {
      await AsyncStorage.removeItem(KEY);
    } catch (error) {
      reportStorageError(error);
    }
    return secure;
  }

  // Move it into SecureStore, and drop the plaintext copy only once the secure
  // copy has been read back. If that fails the old copy stays and is returned,
  // so the student stays connected to Classroom; the next read tries again.
  if (legacyRaw && (await writeSecureVerified(legacyRaw))) {
    try {
      await AsyncStorage.removeItem(KEY);
    } catch (error) {
      reportStorageError(error);
    }
  }
  return legacy;
}

export async function setGoogleProviderTokens(tokens: GoogleProviderTokens): Promise<void> {
  const raw = JSON.stringify(tokens);
  if (secureStoreAvailable && (await writeSecureVerified(raw))) {
    try {
      // A plaintext copy from before must not outlive the secure one.
      await AsyncStorage.removeItem(KEY);
    } catch (error) {
      reportStorageError(error);
    }
    return;
  }
  // Web, or SecureStore refused the write: keep the token where older builds
  // kept it rather than lose it, so Classroom keeps working. A later read
  // retries the move into SecureStore.
  try {
    await AsyncStorage.setItem(KEY, raw);
  } catch (error) {
    reportStorageError(error);
  }
}

export async function clearGoogleProviderTokens(): Promise<void> {
  if (secureStoreAvailable) {
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch (error) {
      reportStorageError(error);
    }
  }
  // Always clear the legacy location too so a pre-migration copy can't linger.
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (error) {
    reportStorageError(error);
  }
}
