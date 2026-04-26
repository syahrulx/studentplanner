import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Direct Google OAuth helpers used by the Classroom integration.
 *
 * The Rencana login (Supabase auth) is intentionally NOT involved here —
 * Classroom authorizes Google separately so that swapping the Google
 * account never touches the user's Supabase session. All calls go to the
 * public Google token endpoint with a platform-specific OAuth client
 * (iOS / Android / Web). No client secret is sent from the device.
 */

export const GOOGLE_CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
];

export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export interface GoogleClientIds {
  iosClientId?: string;
  androidClientId?: string;
  webClientId?: string;
}

/** Read the configured Google OAuth client ids from `app.config.js` → `extra`. */
export function getGoogleClientIds(): GoogleClientIds {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    iosClientId: clean(extra.googleIosClientId),
    androidClientId: clean(extra.googleAndroidClientId),
    webClientId: clean(extra.googleWebClientId),
  };
}

/**
 * Pick the OAuth client for the current platform.
 *
 * **Never** use the "Web" client on iOS/Android: native apps use a custom URL scheme
 * redirect (`com.googleusercontent.apps...` or `com.aizztech.rencana:/...`). Google
 * returns `400 invalid_request: Custom scheme URIs are not allowed for 'WEB' client type`
 * if a web client id is used with that redirect.
 * Web client ids are only valid with `https` redirect URIs (e.g. Supabase browser OAuth).
 */
export function pickPlatformClientId(ids: GoogleClientIds): string | null {
  if (Platform.OS === 'ios') {
    return ids.iosClientId && ids.iosClientId.length > 0 ? ids.iosClientId : null;
  }
  if (Platform.OS === 'android') {
    return ids.androidClientId && ids.androidClientId.length > 0 ? ids.androidClientId : null;
  }
  // e.g. Expo web: https redirects only
  if (ids.webClientId && ids.webClientId.length > 0) return ids.webClientId;
  return null;
}

export interface GoogleTokenResponse {
  accessToken: string;
  /** Absolute epoch ms when `accessToken` expires (approx). */
  expiresAt: number;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
}

function normalizeTokenResponse(raw: Record<string, unknown>): GoogleTokenResponse | null {
  const accessToken = typeof raw.access_token === 'string' ? raw.access_token : null;
  if (!accessToken) return null;
  const expiresIn = Number(raw.expires_in ?? 3600);
  const expiresAt = Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000;
  const refreshToken =
    typeof raw.refresh_token === 'string' && raw.refresh_token.length > 0
      ? raw.refresh_token
      : undefined;
  return {
    accessToken,
    expiresAt,
    refreshToken,
    tokenType: typeof raw.token_type === 'string' ? raw.token_type : undefined,
    scope: typeof raw.scope === 'string' ? raw.scope : undefined,
  };
}

/**
 * Exchange an OAuth authorization code for access + refresh tokens.
 * `codeVerifier` must be the PKCE verifier generated alongside the code.
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
  });

  const res = await fetch(GOOGLE_DISCOVERY.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error_description === 'string' ? json.error_description : json.error;
    throw new Error(
      typeof err === 'string' && err.length > 0
        ? `Google token exchange failed: ${err}`
        : `Google token exchange failed (${res.status}).`,
    );
  }
  const tok = normalizeTokenResponse(json);
  if (!tok) throw new Error('Google token exchange returned no access token.');
  return tok;
}

/**
 * Trade a refresh token for a fresh access token. Google may return a new
 * `refresh_token` on rotation; callers should persist whichever is newer.
 */
export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });

  const res = await fetch(GOOGLE_DISCOVERY.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error_description === 'string' ? json.error_description : json.error;
    throw new Error(
      typeof err === 'string' && err.length > 0
        ? `Google refresh failed: ${err}`
        : `Google refresh failed (${res.status}).`,
    );
  }
  const tok = normalizeTokenResponse(json);
  if (!tok) throw new Error('Google refresh returned no access token.');
  // Preserve caller's refresh token if Google didn't rotate.
  if (!tok.refreshToken) tok.refreshToken = params.refreshToken;
  return tok;
}

/** Best-effort revoke call. Safe to call with an access or refresh token. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_DISCOVERY.revocationEndpoint}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    /* non-fatal — token will expire on its own */
  }
}
