import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Refresh Google Classroom Token (Edge Function)
 *
 * Called by the Android app when the Google access token expires (~1 hour).
 * No browser, no redirect — just a simple API call.
 *
 * Flow:
 * 1. App sends Supabase JWT in Authorization header
 * 2. We look up the user's Google identity in auth.identities
 * 3. We use the stored provider_refresh_token + Supabase's Google client secret
 *    to get a fresh access token from Google
 * 4. Return the fresh token to the app
 *
 * Required secrets (set via `npx supabase secrets set`):
 *   GOOGLE_CLIENT_ID     — The Web OAuth client ID (same as EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
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

    // Create admin client to read identity data
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the user's JWT and get their ID
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    // 2. Find the Google identity and its refresh token
    const googleIdentity = user.identities?.find(
      (id) => id.provider === 'google',
    );

    if (!googleIdentity) {
      return jsonResponse(
        { error: 'No Google account linked. Sign in with Google first.' },
        400,
      );
    }

    // The provider refresh token is stored in identity_data by Supabase
    // We need to query it from auth.identities directly
    const { data: identityRows, error: identityError } = await supabaseAdmin
      .from('identities')
      .select('id, provider, identity_data')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .limit(1);

    // If the direct query doesn't work, try the auth schema
    let providerRefreshToken: string | null = null;

    if (identityRows && identityRows.length > 0) {
      providerRefreshToken = identityRows[0].identity_data?.provider_refresh_token || null;
    }

    // Fallback: try reading from auth.refresh_tokens or the identity itself
    if (!providerRefreshToken) {
      // Try getting it from the user's raw app metadata
      const rawMeta = (user as any).raw_app_meta_data || user.app_metadata;
      providerRefreshToken = rawMeta?.provider_refresh_token || null;
    }

    if (!providerRefreshToken) {
      // Last resort: query auth.identities directly via SQL
      const { data: sqlResult } = await supabaseAdmin.rpc('get_google_refresh_token', {
        p_user_id: user.id,
      }).single();

      if (sqlResult?.refresh_token) {
        providerRefreshToken = sqlResult.refresh_token;
      }
    }

    if (!providerRefreshToken) {
      return jsonResponse(
        {
          error: 'No Google refresh token found. Please sign out and sign in again with Google.',
          code: 'NO_REFRESH_TOKEN',
        },
        400,
      );
    }

    // 3. Refresh the Google access token
    const googleTokenUrl = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: providerRefreshToken,
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

      // If the refresh token is revoked/expired, tell user to re-login
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
