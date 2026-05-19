/**
 * RevenueCat Webhook → Supabase Edge Function
 *
 * When a user subscribes, renews, cancels, or their subscription expires,
 * RevenueCat sends an event here. We update `profiles.subscription_plan`
 * so that server-side Edge Functions (AI generation, token limits) always
 * have the correct plan without needing to call RevenueCat.
 *
 * Setup:
 *   1. Deploy: npx supabase functions deploy revenuecat-webhook
 *   2. Set secret: npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=<your-secret>
 *   3. In RevenueCat dashboard → Webhooks → Add:
 *      URL: https://ujxrtuogdialsrzxkcey.supabase.co/functions/v1/revenuecat-webhook
 *      Authorization: Bearer <your-secret>
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  // ── Verify webhook authenticity ──
  const webhookSecret = (Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '').trim();
  if (webhookSecret) {
    const authHeader = (req.headers.get('Authorization') ?? '').trim();
    if (authHeader !== `Bearer ${webhookSecret}`) {
      console.error('[revenuecat-webhook] Invalid Authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Parse body ──
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const event = body.event as Record<string, unknown> | undefined;
  const eventType = String(event?.type ?? 'unknown');

  // RevenueCat sends the Supabase UUID via app_account_token (set during SDK init),
  // falling back to app_user_id. Handle both top-level and nested formats.
  const appUserId = String(
    event?.app_account_token ??
    body.app_user_id ??
    event?.app_user_id ??
    ''
  ).trim();

  if (!appUserId) {
    console.error('[revenuecat-webhook] Missing app_user_id. Body keys:', Object.keys(body));
    return new Response(JSON.stringify({ error: 'Missing app_user_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Determine new plan from active entitlements ──
  // Entitlement keys match exact IDs in the RevenueCat dashboard.
  const subscriber = (body.subscriber ?? event?.subscriber) as Record<string, unknown> | undefined;
  const entitlements = (subscriber?.entitlements ?? event?.entitlements ?? {}) as Record<
    string,
    { expires_date?: string | null; purchase_date?: string }
  >;

  let newPlan: 'free' | 'plus' | 'pro' = 'free';
  const now = new Date();

  // Check all possible key formats (dashboard ID and display name variants)
  const proKeys  = ['Rencana Pro',  'rencana_pro',  'pro'];
  const plusKeys = ['Rencana Plus', 'rencana_plus', 'plus'];

  // 1. First, check event.entitlement_ids array (most direct and robust for events)
  const activeIds = new Set(
    (Array.isArray(event?.entitlement_ids) ? event.entitlement_ids : [])
      .map((x) => String(x).trim())
  );

  for (const key of proKeys) {
    if (activeIds.has(key)) {
      newPlan = 'pro';
      break;
    }
  }

  if (newPlan === 'free') {
    for (const key of plusKeys) {
      if (activeIds.has(key)) {
        newPlan = 'plus';
        break;
      }
    }
  }

  // 2. Second, fallback to checking entitlements objects (with expiry validation)
  if (newPlan === 'free') {
    for (const key of proKeys) {
      const ent = entitlements[key];
      if (ent) {
        // null expires_date means lifetime / no expiry — treat as active
        if (!ent.expires_date || new Date(ent.expires_date) > now) {
          newPlan = 'pro';
          break;
        }
      }
    }
  }

  // Fall back to Plus
  if (newPlan === 'free') {
    for (const key of plusKeys) {
      const ent = entitlements[key];
      if (ent) {
        if (!ent.expires_date || new Date(ent.expires_date) > now) {
          newPlan = 'plus';
          break;
        }
      }
    }
  }

  // For CANCELLATION / EXPIRATION events → force free
  const expiryEvents = ['EXPIRATION', 'CANCELLATION', 'SUBSCRIBER_ALIAS'];
  if (expiryEvents.includes(eventType) && newPlan === 'free') {
    newPlan = 'free'; // already free, explicit for clarity
  }

  // ── Update Supabase ──
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRole) {
    console.error('[revenuecat-webhook] Missing Supabase env vars');
    return new Response(JSON.stringify({ error: 'Server config error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      subscription_plan: newPlan,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appUserId);

  if (updateError) {
    console.error(`[revenuecat-webhook] DB update failed for ${appUserId}:`, updateError.message);
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(
    `[revenuecat-webhook] ${eventType}: user=${appUserId} → plan=${newPlan}`,
  );

  return new Response(
    JSON.stringify({ ok: true, event: eventType, plan: newPlan }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
