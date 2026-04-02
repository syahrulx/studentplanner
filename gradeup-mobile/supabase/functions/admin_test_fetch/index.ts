// Admin-only: proxy a university integration request safely.
// Deploy: npx supabase functions deploy admin_test_fetch
// Set secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase), plus any allowlist config you want.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authorizeAdminRequest } from '../_shared/adminAuth.ts';

type Json = Record<string, unknown>;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const auth = await authorizeAdminRequest(req);
    if ('error' in auth) return json(auth.status, { error: auth.error });
    const { admin } = auth;

    const payload = (await req.json().catch(() => ({}))) as Json;
    const universityId = String(payload.universityId || '');
    const params = (payload.params || {}) as Json;

    if (!universityId) return json(400, { error: 'missing_universityId' });

    const { data: uni, error: uniErr } = await admin
      .from('universities')
      .select('id,name,api_endpoint,request_method,required_params')
      .eq('id', universityId)
      .maybeSingle();
    if (uniErr || !uni) return json(404, { error: 'university_not_found' });
    if (!uni.api_endpoint) return json(400, { error: 'missing_api_endpoint' });

    const timeoutMs = 12_000;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const method = String(uni.request_method || 'GET').toUpperCase();
    const url = new URL(uni.api_endpoint);
    const init: RequestInit = { method, signal: controller.signal, headers: { 'accept': 'application/json' } };

    if (method === 'GET') {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    } else {
      init.headers = { ...init.headers, 'content-type': 'application/json' };
      init.body = JSON.stringify(params);
    }

    const startedAt = Date.now();
    let status = 0;
    let bodyText = '';
    let ok = false;
    try {
      const resp = await fetch(url.toString(), init);
      status = resp.status;
      ok = resp.ok;
      bodyText = await resp.text();
    } finally {
      clearTimeout(t);
    }

    const elapsedMs = Date.now() - startedAt;
    const parsed = (() => {
      try {
        return JSON.parse(bodyText);
      } catch {
        return { raw: bodyText.slice(0, 5000) };
      }
    })();

    // Log
    await admin.from('admin_logs').insert({
      type: 'api_request',
      status: ok ? 'success' : 'failed',
      meta: { universityId, url: url.toString(), method, httpStatus: status, elapsedMs },
    });

    return json(200, { ok, httpStatus: status, elapsedMs, data: parsed });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'unknown_error' });
  }
});

