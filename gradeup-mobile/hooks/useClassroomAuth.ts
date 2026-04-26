import { useMemo } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
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
 * Supabase Edge Function URL that acts as an HTTPS→custom-scheme redirect
 * proxy for Google Classroom OAuth on Android.
 *
 * Google deprecated custom URI scheme redirects for Android OAuth clients.
 * This function receives the OAuth callback over HTTPS (which Web clients
 * accept), then 302-redirects to `rencana://oauth2redirect?code=...` so
 * Chrome Custom Tabs can hand the result back to the app.
 */
const SUPABASE_REF = 'ujxrtuogdialsrzxkcey';
const ANDROID_CLASSROOM_REDIRECT = `https://${SUPABASE_REF}.supabase.co/functions/v1/classroom-redirect`;

/**
 * Pick the correct client id and redirect URI for the Classroom auth flow.
 *
 * **iOS**: Uses the iOS client id + reversed-client-id URL scheme redirect.
 * **Android**: Uses the Web client id + HTTPS redirect via Edge Function proxy.
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
    // Google deprecated custom URI scheme redirects for Android OAuth clients.
    // Use the Web client id with an HTTPS redirect through our Edge Function proxy.
    const cid = ids.webClientId;
    if (!cid || cid.length === 0) return null;
    return {
      clientId: cid,
      redirectUri: ANDROID_CLASSROOM_REDIRECT,
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
  /** Open the Google consent browser. */
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
 * Use this from the classroom-sync screen: wait for `request` to be loaded,
 * call `promptAsync()`, then on success hand `response.params.code` +
 * `request.codeVerifier` + `redirectUri` + `clientId` to
 * `completeClassroomAuth()` from `src/lib/googleClassroom.ts`.
 *
 * This flow NEVER touches Supabase auth — connecting Classroom with a
 * Google account different from the one used for Rencana login will not
 * sign the user out or switch their Rencana session.
 */
export function useClassroomAuth(): ClassroomAuthState {
  const resolved = useMemo(() => pickClientAndRedirect(getGoogleClientIds()), []);
  const clientId = resolved?.clientId || '';
  const redirectUri = resolved?.redirectUri || '';
  const notConfigured = clientId.length === 0;

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
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
      return promptAsync();
    };
  }, [promptAsync, notConfigured]);

  return {
    request,
    response,
    promptAsync: safePromptAsync,
    redirectUri,
    clientId,
    notConfigured,
  };
}
