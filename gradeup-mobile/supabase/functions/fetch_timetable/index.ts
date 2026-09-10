// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
/**
 * Supabase Edge Function: fetch_timetable — RETIRED
 *
 * This function used to sign in to UiTM MyStudent (Firebase Identity Toolkit)
 * with the student's portal password and fetch their timetable server-side.
 * As of the client-side rewrite it is no longer called by the app: timetables
 * are fetched on device from public UiTM sources using the student ID alone,
 * with no credentials involved. See src/lib/timetableParsers/uitm.ts.
 *
 * The route is kept as a 410 stub rather than deleted so any old app build
 * still pointing here gets a clear "update the app" message instead of a
 * confusing network error. Once dashboard invocations stay at zero for a full
 * release cycle, this directory and the `[functions.fetch_timetable]` entry in
 * supabase/config.toml can both be removed.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error:
        'Timetable sync has moved into the app. Please update Rencana to the latest version.',
      code: 'RETIRED',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
