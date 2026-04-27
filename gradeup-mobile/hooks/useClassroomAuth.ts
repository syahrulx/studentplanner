import { useMemo, useState, useCallback, useRef } from 'react';
import { Platform, DeviceEventEmitter } from 'react-native';
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
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
 * The custom scheme URL that the Edge Function 302-redirects to.
 * Chrome Custom Tabs must watch for THIS URL (not the HTTPS one) to
 * know when to close and return the result to the app.
 */
const ANDROID_APP_RETURN_URL = 'rencana://oauth2redirect';

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

/** Generate a random Base64-URL string for PKCE code_verifier. */
async function generateCodeVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return bytes.reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
}

/** SHA-256 hash → Base64-URL for PKCE code_challenge. */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  // Base64 → Base64-URL
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

  // ── Android-specific state for manual flow ──
  const [androidResponse, setAndroidResponse] = useState<AuthSession.AuthSessionResult | null>(null);
  const codeVerifierRef = useRef<string | null>(null);
  const androidRequestRef = useRef<{ codeVerifier: string } | null>(null);

  const androidPromptAsync = useCallback(async (): Promise<AuthSession.AuthSessionResult> => {
    try {
      // Generate PKCE pair
      const verifier = await generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      codeVerifierRef.current = verifier;
      androidRequestRef.current = { codeVerifier: verifier };

      // Build the Google consent URL manually
      const state = await generateCodeVerifier(); // random state
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: ANDROID_CLASSROOM_REDIRECT,
        response_type: 'code',
        scope: GOOGLE_CLASSROOM_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      });

      const authUrl = `${GOOGLE_DISCOVERY.authorizationEndpoint}?${params.toString()}`;

      // Open browser — tell it to watch for rencana://oauth2redirect (the custom scheme
      // that our Edge Function 302-redirects to), NOT the HTTPS URL.
      // 
      // Because Android intents can sometimes be aggressively swallowed by Expo Router,
      // openAuthSessionAsync might HANG forever without closing the browser.
      // To fix this, we RACE the WebBrowser promise against a DeviceEventEmitter
      // that gets triggered when Expo Router hits our app/oauth2redirect.tsx sinkhole screen!
      const browserPromise = WebBrowser.openAuthSessionAsync(authUrl, ANDROID_APP_RETURN_URL);
      
      const eventPromise = new Promise<AuthSession.AuthSessionResult>((resolve) => {
        const sub = DeviceEventEmitter.addListener('oauth_redirect', (eventParams: any) => {
          if (eventParams.code) {
            resolve({
              type: 'success',
              params: { code: eventParams.code, state: eventParams.state || '', codeVerifier: verifier },
              url: `rencana://oauth2redirect?code=${eventParams.code}&state=${eventParams.state || ''}`,
              authentication: null,
            } as any);
          } else {
            resolve({ type: 'dismiss' } as AuthSession.AuthSessionResult);
          }
        });
        // cleanup listener after 5 minutes just in case
        setTimeout(() => { sub.remove(); resolve({ type: 'dismiss' } as any); }, 300000);
      });

      const result = await Promise.race([browserPromise, eventPromise]);
      // Immediately remove the listener if browser finishes first
      DeviceEventEmitter.removeAllListeners('oauth_redirect');

      if (result.type === 'success' && result.url) {
        // If it came from WebBrowser, it has a URL we need to parse.
        // If it came from eventPromise, we already put the code in params, but parsing is safe.
        const urlObj = new URL(result.url);
        const code = urlObj.searchParams.get('code') || ('params' in result ? (result as any).params?.code : null);
        const returnedState = urlObj.searchParams.get('state') || ('params' in result ? (result as any).params?.state : null);

        if (code) {
          const successResult: AuthSession.AuthSessionResult = {
            type: 'success',
            params: { code, state: returnedState || '', codeVerifier: verifier },
            url: result.url,
            authentication: null,
          } as any;
          setAndroidResponse(successResult);
          return successResult;
        }
      }

      if (result.type === 'cancel' || result.type === 'dismiss') {
        const cancelResult = { type: 'cancel' } as AuthSession.AuthSessionResult;
        setAndroidResponse(cancelResult);
        return cancelResult;
      }

      const dismissResult = { type: 'dismiss' } as AuthSession.AuthSessionResult;
      setAndroidResponse(dismissResult);
      return dismissResult;
    } catch (err: any) {
      const errorResult = {
        type: 'error',
        error: err,
      } as unknown as AuthSession.AuthSessionResult;
      setAndroidResponse(errorResult);
      return errorResult;
    }
  }, [clientId]);

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

  // For Android, expose a synthetic request object with the codeVerifier
  const effectiveRequest = isAndroid
    ? (androidRequestRef.current as AuthSession.AuthRequest | null) ?? request
    : request;

  return {
    request: effectiveRequest,
    response: isAndroid ? androidResponse : response,
    promptAsync: safePromptAsync,
    redirectUri,
    clientId,
    notConfigured,
  };
}
