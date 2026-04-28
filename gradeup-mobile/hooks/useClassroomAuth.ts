import { useMemo, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GOOGLE_CLASSROOM_SCOPES,
  GOOGLE_DISCOVERY,
  getGoogleClientIds,
} from '@/src/lib/googleOauth';
import { supabase } from '@/src/lib/supabase';

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
      redirectUri: '', // Not used for primary flow
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
 * **Android (OVERHAULED)**: Two-step approach:
 *   1. First, check for saved Google provider tokens from login (instant, no browser).
 *   2. If none exist (user logged in before this update, or used email/password),
 *      fallback to a one-time Supabase OAuth flow with Classroom scopes.
 *      This uses the SAME mechanism as the login page (which works on Android!).
 *      After this, the tokens are saved so future connects are instant.
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
   * Android: Try to get Classroom tokens without opening a browser.
   *
   * Step 1: Check AsyncStorage for saved provider tokens from Google login.
   * Step 2 (fallback): If no tokens saved, open a Supabase Google OAuth browser
   *         session with Classroom scopes. This uses the EXACT same flow as the
   *         login page (which works perfectly on Android), just with extra scopes.
   *         The provider_token from the redirect is captured and saved.
   */
  const androidPromptAsync = useCallback(async (): Promise<AuthSession.AuthSessionResult> => {
    try {
      // ── Step 1: Check for saved provider tokens (instant, no browser) ──
      const raw = await AsyncStorage.getItem('googleProviderTokens');

      if (raw) {
        const tokens = JSON.parse(raw) as {
          accessToken: string;
          refreshToken?: string;
          expiresAt?: number;
        };

        if (tokens.accessToken) {
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
        }
      }

      // ── Step 2 (fallback): No saved tokens — use Supabase OAuth ──
      // This uses the SAME mechanism as login.tsx (which works on Android!).
      // We add Classroom scopes so the returned provider_token has access.
      const appScheme = (Constants.expoConfig?.scheme as string) || 'rencana';
      const fallbackRedirect = makeRedirectUri({ scheme: appScheme, path: 'classroom-sync' });

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: fallbackRedirect,
          skipBrowserRedirect: true,
          scopes: GOOGLE_CLASSROOM_SCOPES.join(' '),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (oauthError || !data?.url) {
        const errorResult = {
          type: 'error',
          error: new Error(
            oauthError?.message || 'Could not start Google sign-in for Classroom.',
          ),
        } as unknown as AuthSession.AuthSessionResult;
        setAndroidResponse(errorResult);
        return errorResult;
      }

      // Open the Supabase OAuth URL — same as login page
      const result = await WebBrowser.openAuthSessionAsync(data.url, fallbackRedirect);

      if (result.type !== 'success' || !result.url) {
        const cancelResult = { type: 'cancel' } as AuthSession.AuthSessionResult;
        setAndroidResponse(cancelResult);
        return cancelResult;
      }

      // Parse the redirect URL (same as login.tsx)
      const url = new URL(result.url);
      const params = new URLSearchParams(url.hash.replace('#', ''));
      const providerToken = params.get('provider_token');
      const providerRefreshToken = params.get('provider_refresh_token');
      const supaAccessToken = params.get('access_token');
      const supaRefreshToken = params.get('refresh_token');

      // Re-set the Supabase session (the OAuth flow may have refreshed it)
      if (supaAccessToken && supaRefreshToken) {
        await supabase.auth.setSession({
          access_token: supaAccessToken,
          refresh_token: supaRefreshToken,
        });
      }

      if (!providerToken) {
        const errorResult = {
          type: 'error',
          error: new Error(
            'Google did not return a Classroom access token. Please try again.',
          ),
        } as unknown as AuthSession.AuthSessionResult;
        setAndroidResponse(errorResult);
        return errorResult;
      }

      // Save the provider tokens for future instant access
      await AsyncStorage.setItem(
        'googleProviderTokens',
        JSON.stringify({
          accessToken: providerToken,
          refreshToken: providerRefreshToken || '',
          expiresAt: Date.now() + 3600000,
        }),
      );

      const successResult: AuthSession.AuthSessionResult = {
        type: 'success',
        params: {
          __directToken: 'true',
          accessToken: providerToken,
          refreshToken: providerRefreshToken || '',
          expiresAt: String(Date.now() + 3600000),
        },
        url: result.url,
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
