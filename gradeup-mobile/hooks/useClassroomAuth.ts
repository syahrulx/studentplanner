import { useMemo, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GOOGLE_CLASSROOM_SCOPES,
  GOOGLE_DISCOVERY,
  getGoogleClientIds,
} from '@/src/lib/googleOauth';

WebBrowser.maybeCompleteAuthSession();

/** Strip the `.apps.googleusercontent.com` tail from an OAuth client id. */
function clientIdPrefix(clientId: string): string {
  return clientId.replace(/\.apps\.googleusercontent\.com$/i, '');
}

/**
 * Pick the correct client id and redirect URI for the Classroom auth flow.
 *
 * **iOS**: Uses the iOS client id + reversed-client-id URL scheme redirect.
 * **Android**: Uses the Web client id for token refresh. No browser redirect needed.
 */
function pickClientAndRedirect(ids: ReturnType<typeof getGoogleClientIds>): {
  clientId: string;
  redirectUri: string;
} | null {
  if (Platform.OS === 'ios') {
    const cid = ids.iosClientId;
    if (!cid || cid.length === 0) return null;
    return {
      clientId: cid,
      redirectUri: `com.googleusercontent.apps.${clientIdPrefix(cid)}:/oauthredirect`,
    };
  }

  if (Platform.OS === 'android') {
    const cid = ids.webClientId;
    if (!cid || cid.length === 0) return null;
    return {
      clientId: cid,
      redirectUri: '',
    };
  }

  // Web
  const cid = ids.webClientId;
  if (!cid || cid.length === 0) return null;
  return {
    clientId: cid,
    redirectUri: AuthSession.makeRedirectUri(),
  };
}

export interface ClassroomAuthState {
  /** Loaded auth request object. `null` while configuration is being prepared. */
  request: AuthSession.AuthRequest | null;
  /** Latest response from a prompt (null until the user completes the flow). */
  response: AuthSession.AuthSessionResult | null;
  /** Open the Google consent browser (iOS) or resolve with saved tokens (Android). */
  promptAsync: () => Promise<AuthSession.AuthSessionResult>;
  /** The redirect URI the request will use (passed back to the exchange call). */
  redirectUri: string;
  /** The OAuth client id used for the current platform. */
  clientId: string;
  /** True when no client id is configured for this platform (misconfig). */
  notConfigured: boolean;
}

/**
 * React hook that drives the direct-Google OAuth flow for Classroom.
 *
 * **iOS / Web**: Uses the standard `expo-auth-session` browser flow (unchanged).
 *
 * **Android**: Reads the Google provider tokens saved during the initial
 * Supabase Google login. If no tokens exist (user logged in with email/password),
 * returns an error asking the user to sign in with Google.
 * This ensures:
 *   - Classroom always uses the SAME Google account as the Rencana login
 *   - No second browser session is ever opened
 *   - No redirect/hanging issues
 */
export function useClassroomAuth(): ClassroomAuthState {
  const resolved = useMemo(() => pickClientAndRedirect(getGoogleClientIds()), []);
  const clientId = resolved?.clientId || '';
  const redirectUri = resolved?.redirectUri || '';
  const notConfigured = clientId.length === 0;

  // ── iOS / Web: use the standard useAuthRequest hook ──
  const [request, response, stdPromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId || 'not-configured',
      redirectUri: redirectUri || 'https://example.invalid/',
      responseType: AuthSession.ResponseType.Code,
      scopes: GOOGLE_CLASSROOM_SCOPES,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
    GOOGLE_DISCOVERY,
  );

  // ── Android-specific state ──
  const [androidResponse, setAndroidResponse] = useState<AuthSession.AuthSessionResult | null>(null);

  /**
   * Android: Read saved Google provider tokens from AsyncStorage.
   * These are saved during login/signup when the user signs in with Google.
   * If no tokens exist, the user must sign out and sign in with Google.
   */
  const androidPromptAsync = useCallback(async (): Promise<AuthSession.AuthSessionResult> => {
    try {
      const raw = await AsyncStorage.getItem('googleProviderTokens');

      if (!raw) {
        const errorResult = {
          type: 'error',
          error: new Error(
            'Google Classroom requires a Google account. Please sign out and sign in with Google to connect Classroom.',
          ),
        } as unknown as AuthSession.AuthSessionResult;
        setAndroidResponse(errorResult);
        return errorResult;
      }

      const tokens = JSON.parse(raw) as {
        accessToken: string;
        refreshToken?: string;
        expiresAt?: number;
      };

      if (!tokens.accessToken) {
        const errorResult = {
          type: 'error',
          error: new Error(
            'Your Google session has expired. Please sign out and sign in again with Google.',
          ),
        } as unknown as AuthSession.AuthSessionResult;
        setAndroidResponse(errorResult);
        return errorResult;
      }

      // Return saved token — no browser needed
      const successResult: AuthSession.AuthSessionResult = {
        type: 'success',
        params: {
          __directToken: 'true',
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || '',
          expiresAt: String(tokens.expiresAt || Date.now() + 3600000),
        },
        url: '',
        authentication: null,
      } as any;
      setAndroidResponse(successResult);
      return successResult;
    } catch (err: any) {
      const errorResult = {
        type: 'error',
        error: err,
      } as unknown as AuthSession.AuthSessionResult;
      setAndroidResponse(errorResult);
      return errorResult;
    }
  }, []);

  const isAndroid = Platform.OS === 'android';

  const safePromptAsync = useMemo(() => {
    return async () => {
      if (notConfigured) {
        return {
          type: 'error',
          error: new Error(
            'Google Classroom is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (Android) ' +
            'or EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (iOS) in your build environment.',
          ),
        } as unknown as AuthSession.AuthSessionResult;
      }
      if (isAndroid) {
        return androidPromptAsync();
      }
      return stdPromptAsync();
    };
  }, [stdPromptAsync, androidPromptAsync, notConfigured, isAndroid]);

  return {
    request: isAndroid ? ({} as AuthSession.AuthRequest) : request,
    response: isAndroid ? androidResponse : response,
    promptAsync: safePromptAsync,
    redirectUri,
    clientId,
    notConfigured,
  };
}
