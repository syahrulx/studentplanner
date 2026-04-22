// Admin-protected broadcast endpoint.
// Auth: JWT (admin_users row) OR Bearer ADMIN_WEB_DEV_SECRET (same as other admin_* fns).
//
// Actions:
//   { action: "preview", audience, userIds?, universityId? }
//     → { count: number }
//
//   { action: "send", audience, userIds?, universityId?, title, body,
//       category?: "reaction" | "shared_task" | "circle" | "friend",
//       route?: string, params?: Record<string,string>, collapseKey?: string }
//     → response from community-push ({ sent, batches, results })
//
// Deploy: npx supabase functions deploy admin_community_push

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authorizeAdminRequest, getServiceClient } from '../_shared/adminAuth.ts';

type Audience = 'all' | 'user_ids' | 'university';
type Category = 'reaction' | 'shared_task' | 'circle' | 'friend';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

async function resolveRecipients(
  admin: ReturnType<typeof getServiceClient>,
  audience: Audience,
  userIds: string[] | undefined,
  universityId: string | undefined,
): Promise<string[]> {
  if (audience === 'user_ids') {
    const ids = (userIds ?? []).filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (ids.length === 0) return [];
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .in('id', ids)
      .not('expo_push_token', 'is', null)
      .eq('community_push_enabled', true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  if (audience === 'university') {
    if (!universityId) return [];
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('university_id', universityId)
      .not('expo_push_token', 'is', null)
      .eq('community_push_enabled', true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  // 'all'
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .not('expo_push_token', 'is', null)
    .eq('community_push_enabled', true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { id: string }) => r.id);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = await authorizeAdminRequest(req);
  if ('error' in auth) return json(auth.status, { error: auth.error });
  const { admin } = auth;

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const action = String(payload.action ?? '');
  const audience = (String(payload.audience ?? 'all') as Audience);
  const userIds = Array.isArray(payload.userIds) ? (payload.userIds as string[]) : undefined;
  const universityId =
    typeof payload.universityId === 'string' && payload.universityId.length > 0
      ? (payload.universityId as string)
      : undefined;

  if (!['all', 'user_ids', 'university'].includes(audience)) {
    return json(400, { error: 'invalid_audience' });
  }

  try {
    const recipients = await resolveRecipients(admin, audience, userIds, universityId);

    if (action === 'preview') {
      return json(200, { count: recipients.length });
    }

    if (action === 'send') {
      const title = String(payload.title ?? '').trim();
      const body = String(payload.body ?? '').trim();
      if (!title || !body) return json(400, { error: 'missing_title_or_body' });
      if (recipients.length === 0) return json(200, { sent: 0, reason: 'no_recipients' });

      const category = ((): Category => {
        const c = String(payload.category ?? 'reaction');
        return (['reaction', 'shared_task', 'circle', 'friend'] as Category[]).includes(c as Category)
          ? (c as Category)
          : 'reaction';
      })();

      const route = typeof payload.route === 'string' ? payload.route.trim() : '';
      const params =
        payload.params && typeof payload.params === 'object' && !Array.isArray(payload.params)
          ? (payload.params as Record<string, unknown>)
          : null;

      const data: Record<string, unknown> = { type: 'broadcast' };
      if (route && route.startsWith('/')) data.route = route;
      if (params) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(params)) {
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            flat[k] = String(v);
          }
        }
        if (Object.keys(flat).length > 0) data.params = flat;
      }

      const collapseKey =
        typeof payload.collapseKey === 'string' && payload.collapseKey.length > 0
          ? payload.collapseKey
          : `broadcast:${Date.now()}`;

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !serviceKey) return json(500, { error: 'missing_env' });

      // Delegate to the existing community-push function so all rate-limiting, chunking
      // and opt-in filtering stays in one place.
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/community-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          recipientUserIds: recipients,
          title,
          body,
          category,
          collapseKey,
          data,
        }),
      });

      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { raw: text };
      }

      // Log the broadcast for audit.
      try {
        await admin.from('admin_logs').insert({
          type: 'api_request',
          status: res.ok ? 'success' : 'failed',
          meta: {
            action: 'community_broadcast',
            audience,
            universityId: universityId ?? null,
            recipient_count: recipients.length,
            title,
            body,
            category,
            route: route || null,
            collapseKey,
            response_status: res.status,
          },
        });
      } catch {
        // Non-fatal if logs table is unavailable.
      }

      if (!res.ok) {
        const inner =
          parsed && typeof parsed === 'object' && 'error' in parsed
            ? String((parsed as { error: unknown }).error)
            : (text || `HTTP ${res.status}`).slice(0, 500);
        return json(502, {
          error: `community_push_failed (${res.status}): ${inner}`,
          community_push_status: res.status,
          community_push_response: parsed,
        });
      }
      return json(200, parsed);
    }

    return json(400, { error: 'unknown_action' });
  } catch (err) {
    return json(500, { error: (err as Error).message });
  }
});
