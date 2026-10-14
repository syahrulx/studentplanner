// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
// Admin-only: returns UiTM's public HEA academic-calendar page, so the admin
// website can compare UiTM community calendar submissions with the official
// calendar (the browser can't read hea.uitm.edu.my directly).
//
// Reads ONE fixed public URL. Takes no URL from the caller, sends no student
// data, writes nothing. The page is kept in memory for 3 hours per instance so
// opening the admin page doesn't hit UiTM every time.
//
// Auth: JWT (admin_users row) OR Bearer ADMIN_WEB_DEV_SECRET (same as other admin_* fns).
// Deploy: npx supabase functions deploy admin_uitm_hea

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authorizeAdminRequest } from '../_shared/adminAuth.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

const HEA_CALENDAR_URL = 'https://hea.uitm.edu.my/index.php/calendars/academic-calendar';
const CACHE_MS = 3 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;

let cache: { html: string; fetchedAt: number } | null = null;

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = await authorizeAdminRequest(req);
  if ('error' in auth) return json(auth.status, { error: auth.error });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    // Empty body is fine.
  }
  const refresh = payload.refresh === true;

  if (!refresh && cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return json(200, { html: cache.html, fetched_at: new Date(cache.fetchedAt).toISOString(), from_cache: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(HEA_CALENDAR_URL, {
      signal: controller.signal,
      headers: { accept: 'text/html', 'user-agent': 'RencanaAdmin/1.0 (calendar check)' },
    });
    if (!res.ok) {
      // Serve the last good copy if we have one.
      if (cache) return json(200, { html: cache.html, fetched_at: new Date(cache.fetchedAt).toISOString(), from_cache: true, stale: true });
      return json(502, { error: `hea_http_${res.status}` });
    }
    const html = await res.text();
    if (html.length > MAX_BYTES) return json(502, { error: 'hea_page_too_large' });
    cache = { html, fetchedAt: Date.now() };
    return json(200, { html, fetched_at: new Date(cache.fetchedAt).toISOString(), from_cache: false });
  } catch (err) {
    if (cache) return json(200, { html: cache.html, fetched_at: new Date(cache.fetchedAt).toISOString(), from_cache: true, stale: true });
    return json(502, { error: `hea_unreachable: ${(err as Error).message}` });
  } finally {
    clearTimeout(timer);
  }
});
