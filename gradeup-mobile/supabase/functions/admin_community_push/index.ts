// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
// Admin-protected broadcast endpoint.
// Auth: JWT (admin_users row) OR Bearer ADMIN_WEB_DEV_SECRET (same as other admin_* fns).
//
// Actions:
//   { action: "preview", audience, userIds?, universityId?, campuses? }
//     → { count: number }
//
//   { action: "campuses", universityId }
//     → { campuses: { campus: string, count: number }[] }  (campus text as saved on profiles)
//
//   { action: "send", audience, userIds?, universityId?, campuses?, title, body,
//       category?: "reaction" | "shared_task" | "circle" | "friend",
//       route?: string, params?: Record<string,string>, collapseKey?: string }
//     → 202 { queued: true, log_id } straight away; the inbox writes and the
//       push run in the background and fill in the admin_logs row (phase
//       'sending' → 'done' / 'failed'). 409 duplicate_broadcast if the same
//       title went to the same audience in the last 15 minutes (force: true
//       to send anyway).
//
// Deploy: npx supabase functions deploy admin_community_push

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authorizeAdminRequest, getServiceClient } from '../_shared/adminAuth.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

// 'campus' = one university, limited to the given profiles.campus values.
type Audience = 'all' | 'user_ids' | 'university' | 'campus';
type Category = 'reaction' | 'shared_task' | 'circle' | 'friend';

// Per-admin rate limit: how many successful sends are allowed per window.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_SENDS = 3;
// The same title to the same audience is refused within this window.
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

function jsonResp(status: number, body: unknown, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

// Resolve target user ids for a broadcast.
//
// `pushOnly = false` → every user in the audience. These all receive an in-app
//   notification (the inbox does not depend on push hardware/permissions).
// `pushOnly = true`  → only users eligible for an Expo push (have a registered
//   token AND have community push enabled). Used for the remote push fan-out.
async function resolveRecipients(
  admin: ReturnType<typeof getServiceClient>,
  audience: Audience,
  userIds: string[] | undefined,
  universityId: string | undefined,
  pushOnly: boolean,
  campuses: string[] = [],
): Promise<string[]> {
  const allIds: string[] = [];
  const pageSize = 1000;
  let hasMore = true;
  let page = 0;

  while (hasMore) {
    let query = admin.from('profiles').select('id').order('id');

    if (audience === 'user_ids') {
      const ids = (userIds ?? []).filter((v): v is string => typeof v === 'string' && v.length > 0);
      if (ids.length === 0) return [];
      query = query.in('id', ids);
    } else if (audience === 'university') {
      if (!universityId) return [];
      query = query.eq('university_id', universityId);
    } else if (audience === 'campus') {
      if (!universityId || campuses.length === 0) return [];
      query = query.eq('university_id', universityId).in('campus', campuses);
    }
    // audience === 'all' applies no extra filter.

    if (pushOnly) {
      query = query.not('expo_push_token', 'is', null).eq('community_push_enabled', true);
    }

    const from = page * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    allIds.push(...rows.map((r: { id: string }) => r.id));

    if (rows.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allIds;
}

// How many students at a university saved each campus name (exact saved text).
async function campusCounts(
  admin: ReturnType<typeof getServiceClient>,
  universityId: string,
): Promise<{ campus: string; count: number }[]> {
  const counts = new Map<string, number>();
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await admin
      .from('profiles')
      .select('campus')
      .eq('university_id', universityId)
      .not('campus', 'is', null)
      .order('id')
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows as { campus: string | null }[]) {
      const campus = (row.campus ?? '').trim() ? row.campus! : null;
      if (campus) counts.set(campus, (counts.get(campus) ?? 0) + 1);
    }
    if (rows.length < pageSize) break;
  }
  return [...counts.entries()]
    .map(([campus, count]) => ({ campus, count }))
    .sort((a, b) => b.count - a.count);
}

async function recentBroadcastCount(
  admin: ReturnType<typeof getServiceClient>,
  actor: string,
): Promise<number> {
  const sinceIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from('admin_logs')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'api_request')
    .eq('status', 'success')
    .gte('created_at', sinceIso)
    .contains('meta', { action: 'community_broadcast', actor });
  if (error) return 0; // fail-open rather than block legitimate sends on log outage
  return count ?? 0;
}

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (s: number, b: unknown) => jsonResp(s, b, corsHeaders);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = await authorizeAdminRequest(req);
  if ('error' in auth) return json(auth.status, { error: auth.error });
  const { admin, adminUserId, viaDevSecret } = auth;

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

  const campuses = Array.isArray(payload.campuses)
    ? [...new Set((payload.campuses as unknown[]).filter(
        (c): c is string => typeof c === 'string' && c.length > 0 && c.length <= 200,
      ))].slice(0, 200)
    : [];

  if (action === 'campuses') {
    if (!universityId) return json(400, { error: 'missing_university' });
    try {
      return json(200, { campuses: await campusCounts(admin, universityId) });
    } catch (err) {
      return json(500, { error: (err as Error).message });
    }
  }

  if (!['all', 'user_ids', 'university', 'campus'].includes(audience)) {
    return json(400, { error: 'invalid_audience' });
  }

  try {
    if (action === 'preview') {
      // Everyone in the audience receives an in-app notification.
      const recipients = await resolveRecipients(admin, audience, userIds, universityId, false, campuses);
      return json(200, { count: recipients.length });
    }

    if (action === 'send') {
      const title = String(payload.title ?? '').trim();
      const body = String(payload.body ?? '').trim();
      if (!title || !body) return json(400, { error: 'missing_title_or_body' });

      // Rate-limit per admin (not applied to dev-secret bypass so automated
      // tooling stays unblocked; tighten if needed).
      if (!viaDevSecret && adminUserId) {
        const recent = await recentBroadcastCount(admin, adminUserId);
        if (recent >= RATE_LIMIT_MAX_SENDS) {
          return json(429, {
            error: 'rate_limited',
            message: `You reached ${RATE_LIMIT_MAX_SENDS} broadcasts in the last ${Math.round(
              RATE_LIMIT_WINDOW_MS / 60000,
            )} minutes. Try again later.`,
            retry_after_minutes: Math.round(RATE_LIMIT_WINDOW_MS / 60000),
          });
        }
      }

      // The reply now comes back before sending finishes, so a second press
      // could send the same thing twice. Refuse the same title to the same
      // audience within 15 minutes unless the admin explicitly forces it.
      if (payload.force !== true) {
        const sinceIso = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
        const { count: dupes } = await admin
          .from('admin_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', sinceIso)
          .contains('meta', {
            action: 'community_broadcast',
            title,
            audience,
            universityId: universityId ?? null,
            ...(audience === 'campus' ? { campuses } : {}),
          });
        if ((dupes ?? 0) > 0) {
          return json(409, {
            error: 'duplicate_broadcast',
            message: 'This exact broadcast was already sent to this audience in the last 15 minutes. It is not sent again.',
          });
        }
      }

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

      // One log row per broadcast: written now as "sending", filled in when
      // the background job finishes. Its status (success) also counts towards
      // the rate limit straight away.
      const baseMeta = {
        action: 'community_broadcast',
        actor: adminUserId ?? null,
        via_dev_secret: viaDevSecret,
        audience,
        universityId: universityId ?? null,
        campuses: audience === 'campus' ? campuses : null,
        title,
        body,
        category,
        route: route || null,
        collapseKey,
      };
      const { data: logRow } = await admin
        .from('admin_logs')
        .insert({ type: 'api_request', status: 'success', meta: { ...baseMeta, phase: 'sending' } })
        .select('id')
        .single();
      const logId = (logRow as { id?: string } | null)?.id ?? null;
      const finishLog = async (status: 'success' | 'failed', extra: Record<string, unknown>) => {
        if (!logId) return;
        try {
          await admin.from('admin_logs').update({ status, meta: { ...baseMeta, ...extra } }).eq('id', logId);
        } catch {
          // Non-fatal if logs table is unavailable.
        }
      };

      // Big audiences (a whole university, or everyone) take a minute or two,
      // longer than the gateway waits for a reply (it answered 504 for a
      // 24,922-student UiTM send that had in fact worked). So reply now and do
      // the work in the background.
      const job = async () => {
        try {
          const recipients = await resolveRecipients(admin, audience, userIds, universityId, false, campuses);
          if (recipients.length === 0) {
            await finishLog('success', { phase: 'done', recipient_count: 0, push_recipient_count: 0, reason: 'no_recipients' });
            return;
          }
          // …but only push-eligible users get a remote Expo push.
          const pushRecipients = await resolveRecipients(admin, audience, userIds, universityId, true, campuses);

          // 1. Bulk insert into in_app_notifications, paced.
          // in_app_notifications is on the realtime publication, so every row is
          // checked against every open subscription, and each open app re-counts
          // its unread badge when its row lands. Writing all rows back to back
          // (≈31k for "all") made the database spike, so pause between batches to
          // spread the load. ~62 batches × ~1s ≈ 1 minute for every user, which
          // stays well inside the edge function time limit.
          const chunkSize = 500;
          const pauseBetweenBatchesMs = 700;
          for (let i = 0; i < recipients.length; i += chunkSize) {
            if (i > 0) await new Promise((resolve) => setTimeout(resolve, pauseBetweenBatchesMs));
            const batchIds = recipients.slice(i, i + chunkSize);
            const rows = batchIds.map((uid) => ({
              user_id: uid,
              title: title,
              body: body,
              category: category,
              data: data,
            }));
        
            // We do not await/fail the whole request if inserting in-app notifications fails,
            // but we log the error. We use the service key client (admin) since we bypass RLS for broadcasting.
            const { error: insertErr } = await admin.from('in_app_notifications').insert(rows);
            if (insertErr) {
              console.error('[admin_community_push] Failed to bulk insert in_app_notifications:', insertErr.message);
            }
          }

          // 2. Delegate to the existing community-push function so all rate-limiting, chunking
          // and opt-in filtering stays in one place. Only push-eligible users are sent here;
          // if nobody is eligible we skip the call but the in-app notifications above still stand.
          let parsed: unknown = { sent: 0, reason: 'no_push_recipients' };
          let res: Response | null = null;
          if (pushRecipients.length > 0) {
            res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/community-push`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                recipientUserIds: pushRecipients,
                title,
                body,
                category,
                collapseKey,
                data,
              }),
            });

            const text = await res.text();
            try {
              parsed = text ? JSON.parse(text) : null;
            } catch {
              parsed = { raw: text };
            }
          }

          // A null `res` means there were no push-eligible recipients; the in-app
          // notifications were still written, so that path is a success.
          const pushOk = res === null || res.ok;
          const tickets = Array.isArray((parsed as { results?: unknown })?.results)
            ? ((parsed as { results: { data?: { status?: string; details?: { error?: string } }[] }[] }).results)
                .flatMap((b) => (Array.isArray(b?.data) ? b.data : []))
            : [];
          const failedReasons: Record<string, number> = {};
          tickets.filter((t) => t?.status !== 'ok').forEach((t) => {
            const k = t?.details?.error ?? 'unknown';
            failedReasons[k] = (failedReasons[k] ?? 0) + 1;
          });
          await finishLog(pushOk ? 'success' : 'failed', {
            phase: 'done',
            recipient_count: recipients.length,
            push_recipient_count: pushRecipients.length,
            push_sent: (parsed as { sent?: number })?.sent ?? 0,
            push_accepted: tickets.filter((t) => t?.status === 'ok').length,
            push_failed: tickets.filter((t) => t?.status !== 'ok').length,
            push_failed_reasons: failedReasons,
            response_status: res?.status ?? null,
          });
        } catch (err) {
          await finishLog('failed', { phase: 'failed', error: (err as Error).message });
        }
      };

      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime && typeof runtime.waitUntil === 'function') runtime.waitUntil(job());
      else await job();

      return json(202, { queued: true, log_id: logId });
    }

    return json(400, { error: 'unknown_action' });
  } catch (err) {
    return json(500, { error: (err as Error).message });
  }
});
