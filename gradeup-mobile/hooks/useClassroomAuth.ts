import { useMemo } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  GOOGLE_CLASSROOM_SCOPES,
  GOOGLE_DISCOVERY,
  getGoogleClientIds,
  pickPlatformClientId,
} from '@/src/lib/googleOauth';

WebBrowser.maybeCompleteAuthSession();

/** Strip the `.apps.googleusercontent.com` tail from an OAuth client id. */
function clientIdPrefix(clientId: string): string {
  return clientId.replace(/\.apps\.googleusercontent\.com$/i, '');
}

/**
 * Compose the native OAuth redirect URI Google will send users back to.
 *
 * iOS (iOS OAuth client): uses the reversed client id URL scheme that
 *   Google Cloud Console auto-registers for iOS clients — e.g.
 *   `com.googleusercontent.apps.123-abc:/oauth2redirect`.
 * Android (Android OAuth client): uses the app package scheme, which
 *   `expo-auth-session` handles via an intent filter added by its plugin.
 */
function composeRedirectUri(clientId: string): string {
  if (Platform.OS === 'ios') {
    return `com.googleusercontent.apps.${clientIdPrefix(clientId)}:/oauth2redirect`;
  }
  const pkg =
    (Constants.expoConfig?.android?.package as string | undefined) ||
    (Constants.expoConfig?.ios?.bundleIdentifier as string | undefined) ||
    'com.aizztech.rencana';
  return AuthSession.makeRedirectUri({ native: `${pkg}:/oauth2redirect` });
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
  const clientId = useMemo(() => pickPlatformClientId(getGoogleClientIds()) || '', []);
  const notConfigured = clientId.length === 0;

  const redirectUri = useMemo(
    () => (notConfigured ? '' : composeRedirectUri(clientId)),
    [clientId, notConfigured],
  );

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      // Use a placeholder when misconfigured so the hook still loads;
      // `safePromptAsync` below guards against actually opening it.
      clientId: clientId || 'not-configured',
      redirectUri: redirectUri || 'https://example.invalid/',
      responseType: AuthSession.ResponseType.Code,
      scopes: GOOGLE_CLASSROOM_SCOPES,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        // `consent` forces Google to return a refresh_token on every connect
        // so the app can silently renew without ever reopening the browser.
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
          error: new Error('Google Classroom is not configured.'),
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
