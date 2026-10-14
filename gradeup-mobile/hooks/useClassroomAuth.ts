import { useMemo, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {
  GOOGLE_CLASSROOM_SCOPES,
  GOOGLE_DISCOVERY,
  getGoogleClientIds,
  androidRedirectUri,
} from '@/src/lib/googleOauth';

WebBrowser.maybeCompleteAuthSession();

const DUMMY_REQUEST = {} as AuthSession.AuthRequest;
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
    // An Android client, redirecting on the package name — the direct
    // equivalent of what iOS does above.
    //
    // This used to be the Web client id with an empty redirectUri, which meant
    // Android could not run an OAuth flow at all. It could only reuse a token
    // saved during a Google login, so anyone who had signed in with Apple or
    // with an email address could never connect Classroom, and nothing in the
    // app would ever let them.
    const cid = ids.androidClientId;
    const pkg = (Constants.expoConfig as any)?.android?.package;
    if (cid && cid.length > 0 && pkg) {
      return { clientId: cid, redirectUri: androidRedirectUri(pkg) };
    }

    // No Android client configured: fall back to exactly what this did before.
    // The Web client id cannot complete an exchange from a phone, but it keeps
    // `notConfigured` false, and that is what lets the saved-token path run at
    // all. Returning null here would have marked the whole feature
    // unconfigured and broken Classroom for the students it works for today.
    const web = ids.webClientId;
    if (!web || web.length === 0) return null;
    return { clientId: web, redirectUri: '' };
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
    /**
     * Ask Google properly, in a browser.
     *
     * This is what Android never had. Every dead end below used to end in
     * "sign out and sign in with Google" — advice that does not even work for
     * a student who signed up with Apple or with an email address, because
     * there is no Google account to sign back in with. Now the dead ends lead
     * here instead, and connecting Classroom no longer depends on how somebody
     * happened to create their Rencana account.
     *
     * The saved-token path below still runs first. For the students it already
     * works for, nothing changes and no browser opens.
     */
    const askGoogle = async (): Promise<AuthSession.AuthSessionResult | null> => {
      if (!request) return null;
      const result = await stdPromptAsync();
      setAndroidResponse(result);
      return result;
    };

    try {
      const raw = await AsyncStorage.getItem('googleProviderTokens');

      if (!raw) {
        const viaBrowser = await askGoogle();
        if (viaBrowser) return viaBrowser;
        const errorResult = {
          type: 'error',
          error: new Error(
            'Google Classroom is not set up for this build. Please update the app and try again.',
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
        const viaBrowser = await askGoogle();
        if (viaBrowser) return viaBrowser;
        const errorResult = {
          type: 'error',
          error: new Error(
            'Your Google session has expired. Please sign out and sign in again with Google.',
          ),
        } as unknown as AuthSession.AuthSessionResult;
        setAndroidResponse(errorResult);
        return errorResult;
      }

      // Check if the token has expired (with 60s buffer)
      const isExpired = tokens.expiresAt && tokens.expiresAt < Date.now() + 60_000;
      if (isExpired) {
        // Try refreshing via Edge Function before giving up
        if (tokens.refreshToken) {
          try {
            const { getValidToken: tryRefresh } = await import('@/src/lib/googleClassroom');
            // getValidToken will try the Edge Function and update AsyncStorage if successful
            const freshToken = await tryRefresh();
            if (freshToken) {
              // Re-read the updated tokens
              const updated = await AsyncStorage.getItem('googleProviderTokens');
              if (updated) {
                const updatedTokens = JSON.parse(updated);
                const successResult: AuthSession.AuthSessionResult = {
                  type: 'success',
                  params: {
                    __directToken: 'true',
                    accessToken: updatedTokens.accessToken,
                    refreshToken: '',
                    expiresAt: String(updatedTokens.expiresAt || Date.now() + 3600000),
                  },
                  url: '',
                  authentication: null,
                } as any;
                setAndroidResponse(successResult);
                return successResult;
              }
            }
          } catch {
            /* refresh failed, fall through to error */
          }
        }

        // The saved token is dead and could not be refreshed. Rather than
        // telling a student to sign out of Rencana — which never had anything
        // to do with Classroom — just ask Google again.
        const viaBrowser = await askGoogle();
        if (viaBrowser) return viaBrowser;
        const errorResult = {
          type: 'error',
          error: new Error(
            'Your Google Classroom session has expired. Please sign out and sign in again with Google to refresh it.',
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
          // Don't pass Supabase's provider refresh token — it won't work
          // with our client ID. Token refresh is handled by re-login.
          refreshToken: '',
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
  }, [request, stdPromptAsync]);

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

  /**
   * Android returns the real request once it has one.
   *
   * It used to always hand back DUMMY_REQUEST, because Android could not run
   * an OAuth flow and the screen only needed something truthy to get past its
   * `if (!request) return` guard. Now that Android can ask Google properly,
   * the screen needs the real object: it reads request.codeVerifier to finish
   * the PKCE exchange, and a dummy has none, so the sign-in would complete and
   * then fail with "missing PKCE verifier".
   *
   * The dummy stays for the case where no Android client id is configured. The
   * screen still opens, the saved-token path still runs, and the behaviour is
   * exactly what it is today.
   */
  return {
    request: isAndroid ? (request ?? DUMMY_REQUEST) : request,
    response: isAndroid ? androidResponse : response,
    promptAsync: safePromptAsync,
    redirectUri,
    clientId,
    notConfigured,
  };
}
