import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

/**
 * Google Classroom OAuth redirect proxy.
 *
 * Google's Android OAuth client no longer supports custom URI scheme
 * redirects. This Edge Function acts as an HTTPS redirect endpoint:
 *
 * 1. Google redirects here with ?code=...&state=... (HTTPS — accepted by Web client)
 * 2. We 302-redirect to rencana://oauth2redirect?code=...&state=...
 * 3. Chrome Custom Tab intercepts the custom scheme and returns to the app
 *
 * Add this function's URL to the Web OAuth client's Authorized redirect URIs:
 *   https://<project-ref>.supabase.co/functions/v1/classroom-redirect
 */
serve((req: Request) => {
  const url = new URL(req.url);

  // Forward ALL query parameters from Google → app scheme
  const params = url.searchParams.toString();
  const appRedirect = `rencana://oauth2redirect${params ? '?' + params : ''}`;

  return new Response(null, {
    status: 302,
    headers: {
      'Location': appRedirect,
      'Cache-Control': 'no-store',
    },
  });
});
