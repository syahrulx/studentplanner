// Admin-only user management + dashboard overview counts.
// Auth: JWT (admin_users row) OR Bearer ADMIN_WEB_DEV_SECRET (local dev; set as Edge secret).
// Deploy: npx supabase functions deploy admin_users

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authorizeAdminRequest } from '../_shared/adminAuth.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

type Json = Record<string, unknown>;

function jsonResp(status: number, body: unknown, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const J = (s: number, b: unknown) => jsonResp(s, b, corsHeaders);
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return J(405, { error: 'method_not_allowed' });

    const auth = await authorizeAdminRequest(req);
    if ('error' in auth) return J(auth.status, { error: auth.error });
    const { admin, adminUserId } = auth;

    const payload = (await req.json().catch(() => ({}))) as Json;
    const action = String(payload.action || '');

    if (action === 'dashboard_overview') {
      const [u, uni, tt] = await Promise.all([
        admin.from('profiles').select('*', { count: 'exact', head: true }),
        admin.from('universities').select('*', { count: 'exact', head: true }),
        admin.from('timetable_entries').select('*', { count: 'exact', head: true }),
      ]);
      if (u.error) return J(400, { error: u.error.message });
      if (uni.error) return J(400, { error: uni.error.message });
      if (tt.error) return J(400, { error: tt.error.message });

      const distinctCourses = new Set<string>();
      const { data: distinctCourseRows, error: dcErr } = await admin
        .from('user_courses')
        .select('subject_id')
        .limit(100000);
      if (dcErr) return J(400, { error: dcErr.message });
      for (const r of (distinctCourseRows ?? []) as Array<{ subject_id: string }>) distinctCourses.add(r.subject_id);

      return J(200, {
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
        // Strip PostgREST `or(...)` control chars so users can't break out of
        // the grouped filter and inject additional clauses.
        const safe = q.replace(/[,():*\\%]/g, ' ').trim();
        if (safe) query = query.or(`name.ilike.%${safe}%,student_id.ilike.%${safe}%`);
      }

      const { data, count, error: e } = await query;
      if (e) return J(400, { error: e.message });
      return J(200, { items: data ?? [], count: count ?? 0, offset, limit });
    }

    if (action === 'set_status') {
      const userId = String(payload.userId || '').trim();
      const status = String(payload.status || '').trim();
      if (!userId) return J(400, { error: 'missing_userId' });
      if (!['active', 'disabled', 'banned'].includes(status)) return J(400, { error: 'invalid_status' });

      const { error: e } = await admin.from('profiles').update({ status }).eq('id', userId);
      if (e) return J(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, userId, status, actor: adminUserId ?? null },
      });
      return J(200, { ok: true });
    }

    if (action === 'set_subscription_plan') {
      const userId = String(payload.userId || '').trim();
      const subscription_plan = String(payload.subscription_plan || '').trim();
      if (!userId) return J(400, { error: 'missing_userId' });
      if (!['free', 'plus', 'pro'].includes(subscription_plan)) return J(400, { error: 'invalid_subscription_plan' });

      const { error: e } = await admin.from('profiles').update({ subscription_plan }).eq('id', userId);
      if (e) return J(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, userId, subscription_plan, actor: adminUserId ?? null },
      });
      return J(200, { ok: true });
    }

    if (action === 'delete') {
      const userId = String(payload.userId || '').trim();
      if (!userId) return J(400, { error: 'missing_userId' });

      // Cascade app-side data first (migration 054 wires on-delete cascades for
      // auth.users, but run a belt-and-braces function in case the migration
      // hasn't been applied to this environment yet).
      try {
        await admin.rpc('admin_cascade_delete_user', { p_user_id: userId });
      } catch {
        // The RPC may not exist on older deployments; fall back to the
        // original minimal cleanup below.
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) return J(400, { error: delErr.message });

      // Legacy cleanup (safe no-op if the cascade already removed these).
      await admin.from('profiles').delete().eq('id', userId);
      await admin.from('timetable_entries').delete().eq('user_id', userId);
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, userId, actor: adminUserId ?? null },
      });

      return J(200, { ok: true });
    }

    return J(400, { error: 'unknown_action' });
  } catch (e) {
    return J(500, { error: e instanceof Error ? e.message : 'unknown_error' });
  }
});
