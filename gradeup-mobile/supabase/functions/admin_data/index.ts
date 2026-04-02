// Admin CRUD + reads that normally require RLS (universities, logs, timetables, test fetch).
// Auth: JWT (admin_users row) OR Bearer ADMIN_WEB_DEV_SECRET (set on the function; never use service role in the browser).
// Deploy: npx supabase functions deploy admin_data
// Secrets: supabase secrets set ADMIN_WEB_DEV_SECRET="$(openssl rand -hex 32)"   # optional; local dev bypass

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
    const action = String(payload.action || '');

    if (action === 'universities_list') {
      const { data, error: e } = await admin
        .from('universities')
        .select('id,name,api_endpoint,login_method,request_method,required_params,response_sample')
        .order('name', { ascending: true });
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'university_upsert') {
      const row = payload.row as Record<string, unknown> | undefined;
      if (!row || typeof row !== 'object') return json(400, { error: 'missing_row' });
      const { data, error: e } = await admin.from('universities').upsert(row).select().single();
      if (e) return json(400, { error: e.message });
      return json(200, { row: data });
    }

    if (action === 'university_delete') {
      const id = String(payload.id || '').trim();
      if (!id) return json(400, { error: 'missing_id' });
      const { error: e } = await admin.from('universities').delete().eq('id', id);
      if (e) return json(400, { error: e.message });
      return json(200, { ok: true });
    }

    if (action === 'mapping_get') {
      const universityId = String(payload.universityId || '').trim();
      if (!universityId) return json(400, { error: 'missing_universityId' });
      const { data, error: e } = await admin
        .from('university_mappings')
        .select('university_id,timetable_mapping')
        .eq('university_id', universityId)
        .maybeSingle();
      if (e) return json(400, { error: e.message });
      return json(200, { mapping: data });
    }

    if (action === 'mapping_save') {
      const universityId = String(payload.universityId || '').trim();
      const timetable_mapping = payload.timetable_mapping;
      if (!universityId) return json(400, { error: 'missing_universityId' });
      const { data, error: e } = await admin
        .from('university_mappings')
        .upsert({ university_id: universityId, timetable_mapping })
        .select()
        .single();
      if (e) return json(400, { error: e.message });
      return json(200, { mapping: data });
    }

    if (action === 'logs_list') {
      const type = String(payload.type || 'all');
      const status = String(payload.status || 'all');
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      let q = admin.from('admin_logs').select('id,type,status,meta,created_at').order('created_at', { ascending: false }).limit(lim);
      if (type !== 'all') q = q.eq('type', type);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error: e } = await q;
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'timetables_list') {
      const userId = String(payload.userId || '').trim();
      const universityId = String(payload.universityId || '').trim();
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      let q = admin
        .from('timetable_entries')
        .select('id,user_id,day,subject_code,subject_name,lecturer,start_time,end_time,location');
      if (userId) q = q.eq('user_id', userId);
      const { data, error: e } = await q.limit(lim);
      if (e) return json(400, { error: e.message });
      let items = data ?? [];
      if (universityId) {
        const ids = Array.from(new Set(items.map((x: { user_id: string }) => x.user_id)));
        if (ids.length) {
          const { data: profs, error: pe } = await admin.from('profiles').select('id,university_id').in('id', ids);
          if (pe) return json(400, { error: pe.message });
          const map = new Map((profs ?? []).map((p: { id: string; university_id: string | null }) => [p.id, p.university_id]));
          items = items.filter((t: { user_id: string }) => map.get(t.user_id) === universityId);
        }
      }
      return json(200, { items });
    }

    if (action === 'timetable_delete') {
      const id = String(payload.id || '').trim();
      const user_id = String(payload.userId || '').trim();
      if (!id || !user_id) return json(400, { error: 'missing_id_or_userId' });
      const { error: e } = await admin.from('timetable_entries').delete().eq('id', id).eq('user_id', user_id);
      if (e) return json(400, { error: e.message });
      return json(200, { ok: true });
    }

    if (action === 'test_fetch') {
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
      const init: RequestInit = { method, signal: controller.signal, headers: { accept: 'application/json' } };

      if (method === 'GET') {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
      } else {
        init.headers = { ...init.headers, 'content-type': 'application/json' };
        init.body = JSON.stringify(params);
      }

      const startedAt = Date.now();
      let httpStatus = 0;
      let bodyText = '';
      let ok = false;
      try {
        const resp = await fetch(url.toString(), init);
        httpStatus = resp.status;
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

      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: ok ? 'success' : 'failed',
        meta: { universityId, url: url.toString(), method, httpStatus, elapsedMs },
      });

      return json(200, { ok, httpStatus, elapsedMs, data: parsed });
    }

    return json(400, { error: 'unknown_action' });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'unknown_error' });
  }
});
