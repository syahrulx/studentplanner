// Admin-only user management + dashboard overview counts.
// Auth: JWT (admin_users row) OR Bearer ADMIN_WEB_DEV_SECRET (local dev; set as Edge secret).
// Deploy: npx supabase functions deploy admin_users

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authorizeAdminRequest } from '../_shared/adminAuth.ts';

type Json = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const auth = await authorizeAdminRequest(req);
    if ('error' in auth) return json(auth.status, { error: auth.error });
    const { admin } = auth;

    const payload = (await req.json().catch(() => ({}))) as Json;
    const action = String(payload.action || '');

    if (action === 'dashboard_overview') {
      const [u, uni, tt] = await Promise.all([
        admin.from('profiles').select('*', { count: 'exact', head: true }),
        admin.from('universities').select('*', { count: 'exact', head: true }),
        admin.from('timetable_entries').select('*', { count: 'exact', head: true }),
      ]);
      if (u.error) return json(400, { error: u.error.message });
      if (uni.error) return json(400, { error: uni.error.message });
      if (tt.error) return json(400, { error: tt.error.message });

      // Derive distinct course count in JS to avoid extra SQL in this simple function.
      const distinctCourses = new Set(
        // subjectCount.data is not fetched; we need query for distinct subject_id.
        // Use a second query for distinct course ids when needed.
        [],
      );
      // The `courseCount` query above isn't reliable for distinct count, so run a proper distinct query.
      const { data: distinctCourseRows, error: dcErr } = await admin
        .from('user_courses')
        .select('subject_id')
        .limit(100000);
      if (dcErr) return json(400, { error: dcErr.message });
      for (const r of (distinctCourseRows ?? []) as Array<{ subject_id: string }>) distinctCourses.add(r.subject_id);

      return json(200, {
        total_users: u.count ?? 0,
        total_universities: uni.count ?? 0,
        total_courses: distinctCourses.size,
        total_timetables: tt.count ?? 0,
      });
    }

    if (action === 'list') {
      const q = String(payload.query || '').trim();
      const universityId = String(payload.universityId || '').trim();
      const plan = String(payload.plan || 'all').trim();
      const limit = Math.max(1, Math.min(200, Number(payload.limit || 50)));
      const offset = Math.max(0, Number(payload.offset || 0));

      let query = admin
        .from('profiles')
        .select('id,name,student_id,university_id,created_at,status,updated_at,subscription_plan', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (universityId) query = query.eq('university_id', universityId);
      if (plan === 'free' || plan === 'plus' || plan === 'pro') query = query.eq('subscription_plan', plan);
      if (q) {
        query = query.or(`name.ilike.%${q}%,student_id.ilike.%${q}%`);
      }

      const { data, count, error: e } = await query;
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [], count: count ?? 0, offset, limit });
    }

    if (action === 'set_status') {
      const userId = String(payload.userId || '').trim();
      const status = String(payload.status || '').trim();
      if (!userId) return json(400, { error: 'missing_userId' });
      if (!['active', 'disabled', 'banned'].includes(status)) return json(400, { error: 'invalid_status' });

      const { error: e } = await admin.from('profiles').update({ status }).eq('id', userId);
      if (e) return json(400, { error: e.message });
      await admin.from('admin_logs').insert({ type: 'api_request', status: 'success', meta: { action, userId, status } });
      return json(200, { ok: true });
    }

    if (action === 'set_subscription_plan') {
      const userId = String(payload.userId || '').trim();
      const subscription_plan = String(payload.subscription_plan || '').trim();
      if (!userId) return json(400, { error: 'missing_userId' });
      if (!['free', 'plus', 'pro'].includes(subscription_plan)) return json(400, { error: 'invalid_subscription_plan' });

      const { error: e } = await admin.from('profiles').update({ subscription_plan }).eq('id', userId);
      if (e) return json(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, userId, subscription_plan },
      });
      return json(200, { ok: true });
    }

    if (action === 'delete') {
      const userId = String(payload.userId || '').trim();
      if (!userId) return json(400, { error: 'missing_userId' });

      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) return json(400, { error: delErr.message });

      await admin.from('profiles').delete().eq('id', userId);
      await admin.from('timetable_entries').delete().eq('user_id', userId);
      await admin.from('admin_logs').insert({ type: 'api_request', status: 'success', meta: { action, userId } });

      return json(200, { ok: true });
    }

    return json(400, { error: 'unknown_action' });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'unknown_error' });
  }
});
