// Sends an Expo push to a set of user IDs, honoring per-user & per-category opt-out.
//
// Auth:
//   - Called from Postgres triggers via pg_net with the service-role key (see migration 053).
//   - Optionally callable from the client with the user's JWT; handled the same way.
//
// Body:
//   {
//     "recipientUserIds": ["<uuid>", ...],
//     "title": "string",
//     "body":  "string",
//     "category": "reaction" | "friend" | "circle" | "shared_task" | "quiz" | "goal",
//     "data":   { ...arbitrary JSON forwarded to the client },
//     "collapseKey": "optional group id — Android collapseId / iOS apns-collapse-id"
//   }
//
// Deploy: npx supabase functions deploy community-push
// Required env vars (already set by Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   EXPO_ACCESS_TOKEN — for "Enhanced Push Security" on Expo

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { buildCorsHeaders } from '../_shared/cors.ts';

type Category = 'reaction' | 'friend' | 'circle' | 'shared_task' | 'quiz' | 'goal';

type PushRequest = {
  recipientUserIds: string[];
  title: string;
  body: string;
  category?: Category;
  data?: Record<string, unknown>;
  collapseKey?: string;
};

type ProfileRow = {
  id: string;
  expo_push_token: string | null;
  community_push_enabled?: boolean | null;
  push_reactions_enabled?: boolean | null;
  push_friend_requests_enabled?: boolean | null;
  push_circle_enabled?: boolean | null;
  push_shared_task_enabled?: boolean | null;
};

/** Map a category to the per-category column; reactions cover quiz/goal too by default. */
function isCategoryEnabled(p: ProfileRow, category?: Category): boolean {
  if (p.community_push_enabled === false) return false;
  switch (category) {
    case 'friend':
      return p.push_friend_requests_enabled !== false;
    case 'circle':
      return p.push_circle_enabled !== false;
    case 'shared_task':
      return p.push_shared_task_enabled !== false;
    case 'reaction':
    case 'quiz':
    case 'goal':
    default:
      return p.push_reactions_enabled !== false;
  }
}

function jsonResp(status: number, body: unknown, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (s: number, b: unknown) => jsonResp(s, b, corsHeaders);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let payload: PushRequest;
  try {
    payload = (await req.json()) as PushRequest;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const ids = Array.isArray(payload.recipientUserIds)
    ? payload.recipientUserIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  if (ids.length === 0) return json(200, { sent: 0, reason: 'no_recipients' });
  if (!payload.title || !payload.body) return json(400, { error: 'missing_title_or_body' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'missing_env' });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: profiles, error: profilesErr } = await admin
    .from('profiles')
    .select(
      'id, expo_push_token, community_push_enabled, push_reactions_enabled, push_friend_requests_enabled, push_circle_enabled, push_shared_task_enabled',
    )
    .in('id', ids);

  if (profilesErr) return json(500, { error: profilesErr.message });

  const tokens = ((profiles ?? []) as ProfileRow[])
    .filter((p: ProfileRow) => typeof p.expo_push_token === 'string' && p.expo_push_token.startsWith('ExponentPushToken['))
    .filter((p: ProfileRow) => isCategoryEnabled(p, payload.category))
    .map((p: ProfileRow) => p.expo_push_token as string);

  if (tokens.length === 0) return json(200, { sent: 0, reason: 'no_eligible_tokens' });

  const messages = tokens.map((to: string) => ({
    to,
    title: payload.title,
    body: payload.body,
    sound: 'default',
    priority: 'high',
    channelId: 'community',
    collapseId: payload.collapseKey,
    data: {
      ...(payload.data ?? {}),
      category: payload.category ?? 'reaction',
    },
  }));

  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  const results: unknown[] = [];
  // Expo accepts up to 100 messages per request.
  for (const batch of chunk(messages, 100)) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          ...(expoToken ? { Authorization: `Bearer ${expoToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });
      const text = await res.text();
      try {
        results.push(JSON.parse(text));
      } catch {
        results.push({ status: res.status, body: text });
      }
    } catch (err) {
      results.push({ error: (err as Error).message });
    }
  }

  return json(200, { sent: tokens.length, batches: results.length, results });
});
