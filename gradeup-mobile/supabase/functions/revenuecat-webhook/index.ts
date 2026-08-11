/**
 * RevenueCat webhook -> Supabase billing source of truth.
 *
 * Provider facts are stored separately, then the database recomputes the
 * effective plan across RevenueCat, Curlec/Razorpay, and admin grants. An
 * expiry from one provider must never erase another provider's valid access.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

type Json = Record<string, unknown>;
type Plan = 'free' | 'plus' | 'pro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'EXPIRATION',
  'REFUND',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

function json(status: number, value: unknown) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function planFromLabel(value: string): Exclude<Plan, 'free'> | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const tokens = normalized.split('_').filter(Boolean);
  if (tokens.includes('pro') || normalized === 'rencana_pro') return 'pro';
  if (tokens.includes('plus') || normalized === 'rencana_plus') return 'plus';
  return null;
}

function derivePlan(entitlementIds: string[], productId: string): Exclude<Plan, 'free'> | null {
  const candidates = [...entitlementIds, productId].filter(Boolean);
  if (candidates.some((candidate) => planFromLabel(candidate) === 'pro')) return 'pro';
  if (candidates.some((candidate) => planFromLabel(candidate) === 'plus')) return 'plus';
  return null;
}

function billingStatus(eventType: string, periodType: string): string {
  if (eventType === 'EXPIRATION') return 'expired';
  if (eventType === 'REFUND') return 'refunded';
  if (eventType === 'CANCELLATION') return 'cancelled';
  if (eventType === 'BILLING_ISSUE') return 'billing_issue';
  if (eventType === 'SUBSCRIPTION_PAUSED') return 'paused';
  if (eventType === 'TEMPORARY_ENTITLEMENT_GRANT') return 'temporary';
  if (periodType === 'TRIAL') return 'trial';
  if (periodType === 'INTRO') return 'introductory';
  if (periodType === 'PROMOTIONAL') return 'promotional';
  if (periodType === 'PREPAID') return 'prepaid';
  return 'active';
}

function isoFromMillis(value: unknown): string | null {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Fail closed. A missing secret must never turn the public endpoint into an
  // unauthenticated subscription writer.
  const webhookSecret = text(Deno.env.get('REVENUECAT_WEBHOOK_SECRET'));
  if (!webhookSecret) {
    console.error('[revenuecat-webhook] REVENUECAT_WEBHOOK_SECRET is not configured');
    return json(503, { error: 'webhook_not_configured' });
  }
  if (text(req.headers.get('Authorization')) !== `Bearer ${webhookSecret}`) {
    console.error('[revenuecat-webhook] rejected invalid authorization');
    return json(401, { error: 'unauthorized' });
  }

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const event = (body.event ?? {}) as Json;
  const eventType = text(event.type).toUpperCase() || 'UNKNOWN';
  const eventAppUserId = text(event.app_user_id) || text(body.app_user_id);
  const originalAppUserId = text(event.original_app_user_id) || text(body.original_app_user_id);
  const appAccountToken = text(event.app_account_token);
  const aliases = unique([...strings(event.aliases), ...strings(body.aliases)]);
  const identityCandidates = unique([appAccountToken, eventAppUserId, originalAppUserId, ...aliases]);
  const uuidCandidates = identityCandidates.filter((candidate) => UUID_RE.test(candidate));
  const eventId = text(event.id) || `${eventType}:${eventAppUserId || originalAppUserId}:${text(event.event_timestamp_ms)}`;
  const productId = text(event.product_id);
  const entitlementIds = unique(strings(event.entitlement_ids));
  const periodType = text(event.period_type).toUpperCase();
  const environment = text(event.environment).toUpperCase();
  const store = text(event.store).toUpperCase();
  const price = Number(event.price);
  const currency = text(event.currency).toUpperCase();

  const supabaseUrl = text(Deno.env.get('SUPABASE_URL'));
  const serviceRole = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!supabaseUrl || !serviceRole) {
    console.error('[revenuecat-webhook] missing Supabase environment variables');
    return json(500, { error: 'server_config_error' });
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auditBase = {
    event_id: eventId,
    event_type: eventType,
    event_app_user_id: eventAppUserId || originalAppUserId || null,
    product_id: productId || null,
    entitlement_ids: entitlementIds,
    period_type: periodType || null,
    environment: environment || null,
    store: store || null,
    price: Number.isFinite(price) ? price : null,
    currency: currency || null,
  };

  const recordAudit = async (values: Json) => {
    const { error } = await admin
      .from('revenuecat_webhook_events')
      .upsert({ ...auditBase, ...values }, { onConflict: 'event_id' });
    if (error) console.error('[revenuecat-webhook] audit write failed:', error.message);
  };

  // RevenueCat retries events. A processed event is safe to acknowledge again.
  const { data: previous } = await admin
    .from('revenuecat_webhook_events')
    .select('processing_status')
    .eq('event_id', eventId)
    .maybeSingle();
  if (previous?.processing_status === 'processed' || previous?.processing_status === 'ignored') {
    return json(200, { ok: true, duplicate: true, event: eventType });
  }

  if (!SUPPORTED_EVENTS.has(eventType)) {
    await recordAudit({ processing_status: 'ignored', error: `unsupported_event:${eventType}`, processed_at: new Date().toISOString() });
    return json(200, { ok: true, ignored: true, event: eventType });
  }

  if (identityCandidates.length === 0) {
    await recordAudit({ processing_status: 'unmatched', error: 'missing_identity' });
    return json(422, { error: 'missing_revenuecat_identity' });
  }

  const matches = new Map<string, { id: string; subscription_plan: Plan }>();
  if (uuidCandidates.length > 0) {
    const { data, error } = await admin
      .from('profiles')
      .select('id,subscription_plan')
      .in('id', uuidCandidates);
    if (error) return json(500, { error: 'profile_lookup_failed' });
    for (const row of data ?? []) matches.set(row.id, row as { id: string; subscription_plan: Plan });
  }

  // This also supports future RevenueCat IDs that are not Supabase UUIDs.
  for (const candidate of identityCandidates) {
    const { data, error } = await admin
      .from('profiles')
      .select('id,subscription_plan')
      .eq('revenuecat_app_user_id', candidate)
      .limit(2);
    if (error) return json(500, { error: 'profile_lookup_failed' });
    for (const row of data ?? []) matches.set(row.id, row as { id: string; subscription_plan: Plan });
  }

  if (matches.size === 0) {
    console.error('[revenuecat-webhook] no profile matched RevenueCat identities for event', eventId);
    await recordAudit({ processing_status: 'unmatched', error: 'no_profile_match' });
    return json(422, { error: 'no_profile_match' });
  }
  if (matches.size > 1) {
    console.error('[revenuecat-webhook] identities matched multiple profiles for event', eventId);
    await recordAudit({ processing_status: 'conflict', error: 'multiple_profile_matches' });
    return json(409, { error: 'multiple_profile_matches' });
  }

  const profile = [...matches.values()][0];
  const { data: existingEntitlement, error: entitlementLookupError } = await admin
    .from('subscription_entitlements')
    .select('plan')
    .eq('user_id', profile.id)
    .eq('provider', 'revenuecat')
    .maybeSingle();
  if (entitlementLookupError) {
    await recordAudit({ resolved_user_id: profile.id, processing_status: 'rejected', error: entitlementLookupError.message });
    return json(500, { error: 'entitlement_lookup_failed' });
  }

  const detectedPlan = derivePlan(entitlementIds, productId);
  const revenueCatPlan = detectedPlan ?? (existingEntitlement?.plan as Exclude<Plan, 'free'> | undefined);
  if (!revenueCatPlan) {
    await recordAudit({
      resolved_user_id: profile.id,
      processing_status: 'rejected',
      error: 'cannot_determine_plan',
    });
    return json(422, { error: 'cannot_determine_plan' });
  }

  const status = billingStatus(eventType, periodType);
  const now = new Date().toISOString();
  const { error: entitlementError } = await admin
    .from('subscription_entitlements')
    .upsert({
      user_id: profile.id,
      provider: 'revenuecat',
      external_id: eventAppUserId || originalAppUserId || appAccountToken || profile.id,
      plan: revenueCatPlan,
      status,
      period_type: periodType || null,
      product_id: productId || null,
      store: store || 'REVENUECAT',
      environment: environment || 'PRODUCTION',
      expires_at: isoFromMillis(event.expiration_at_ms),
      price: Number.isFinite(price) ? price : null,
      currency: currency || null,
      last_event_id: eventId,
      updated_at: now,
    }, { onConflict: 'user_id,provider' });

  if (entitlementError) {
    console.error('[revenuecat-webhook] entitlement update failed:', entitlementError.message);
    await recordAudit({ resolved_user_id: profile.id, derived_plan: revenueCatPlan, processing_status: 'rejected', error: entitlementError.message });
    return json(500, { error: 'entitlement_update_failed' });
  }

  const { data: effectiveRows, error: recomputeError } = await admin.rpc(
    'recompute_subscription_access',
    { p_user_id: profile.id },
  );
  if (recomputeError || !Array.isArray(effectiveRows) || !effectiveRows[0]) {
    const message = recomputeError?.message || 'subscription_recompute_returned_no_row';
    console.error('[revenuecat-webhook] subscription recompute failed:', message);
    await recordAudit({ resolved_user_id: profile.id, derived_plan: revenueCatPlan, processing_status: 'rejected', error: message });
    return json(500, { error: 'profile_update_failed' });
  }

  const effectivePlan = text(effectiveRows[0].subscription_plan) as Plan;
  const { error: identityUpdateError } = await admin
    .from('profiles')
    .update({
      revenuecat_app_user_id: eventAppUserId || originalAppUserId || appAccountToken || null,
      last_revenuecat_event_id: eventId,
    })
    .eq('id', profile.id);
  if (identityUpdateError) {
    console.error('[revenuecat-webhook] RevenueCat identity update failed:', identityUpdateError.message);
  }

  await recordAudit({
    resolved_user_id: profile.id,
    derived_plan: effectivePlan,
    processing_status: 'processed',
    error: null,
    processed_at: new Date().toISOString(),
  });

  console.log(`[revenuecat-webhook] ${eventType}: user=${profile.id} rc=${revenueCatPlan} effective=${effectivePlan} status=${status}`);
  return json(200, { ok: true, event: eventType, plan: effectivePlan, billing_status: status });
});
