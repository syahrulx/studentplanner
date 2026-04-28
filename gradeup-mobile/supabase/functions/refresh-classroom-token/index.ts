import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Refresh Google Classroom Token (Edge Function)
 *
 * Called by the Android app when the Google access token expires (~1 hour).
 * No browser, no redirect — just a simple API call.
 *
 * Flow:
 * 1. App sends Supabase JWT + Google refresh_token in request body
 * 2. We verify the user is authenticated
 * 3. We use the refresh_token + GOOGLE_CLIENT_SECRET to get a fresh
 *    access token from Google's token endpoint
 * 4. Return the fresh access token to the app
 *
 * Why server-side? The Google refresh token is tied to the OAuth client
 * that Supabase used during login. Refreshing it requires the client_secret,
 * which must never be on the device. The Edge Function holds the secret.
 *
 * Required secrets (set via `npx supabase secrets set`):
 *   GOOGLE_CLIENT_ID     — The Web OAuth client ID (same one configured in Supabase Auth → Google)
 *   GOOGLE_CLIENT_SECRET — The Web OAuth client secret (from Google Cloud Console)
 */
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    // 1. Authenticate the user via their Supabase JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!googleClientId || !googleClientSecret) {
      return jsonResponse(
        { error: 'Google OAuth not configured on server. Contact admin.' },
        500,
      );
    }

    // Verify the user's JWT
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    // 2. Read the Google refresh token from the request body
    let refreshToken: string | null = null;
    try {
      const body = await req.json();
      refreshToken = body?.refreshToken || null;
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    if (!refreshToken) {
      return jsonResponse(
        {
          error: 'No Google refresh token provided. Please sign out and sign in again with Google.',
          code: 'NO_REFRESH_TOKEN',
        },
        400,
      );
    }

    // 3. Refresh the Google access token using the client secret
    const googleTokenUrl = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: googleClientId,
      client_secret: googleClientSecret,
    });

    const googleRes = await fetch(googleTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const googleJson = await googleRes.json();

    if (!googleRes.ok) {
      const errMsg = googleJson.error_description || googleJson.error || 'Unknown error';
      console.error('Google token refresh failed:', errMsg);

      if (googleJson.error === 'invalid_grant') {
        return jsonResponse(
          {
            error: 'Google access was revoked. Please sign out and sign in again with Google.',
            code: 'INVALID_GRANT',
          },
          400,
        );
      }

      return jsonResponse({ error: `Google refresh failed: ${errMsg}` }, 502);
    }

    if (!googleJson.access_token) {
      return jsonResponse({ error: 'Google returned no access token' }, 502);
    }

    // 4. Return the fresh token
    const expiresIn = Number(googleJson.expires_in || 3600);
    return jsonResponse({
      accessToken: googleJson.access_token,
      expiresIn,
      expiresAt: Date.now() + expiresIn * 1000,
    });
  } catch (err) {
    console.error('refresh-classroom-token error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
