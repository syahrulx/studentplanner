/**
 * RevenueCat webhook -> Supabase billing source of truth.
 *
 * Provider facts are stored separately, then the database recomputes the
 * effective plan across RevenueCat, Curlec/Razorpay, and admin grants. An
 * expiry from one provider must never erase another provider's valid access.
 *
 * The webhook is only a trigger. Each event can describe a different
 * subscription (a Plus trial next to a paid Pro, or a Play purchase that a
 * re-subscribe replaced), and events arrive out of order, so applying the
 * event's own state let a stale EXPIRATION downgrade a paying user to free.
 * With REVENUECAT_API_KEY set we ask RevenueCat for the subscriber's current
 * entitlements and store that instead. Without it we fall back to the event.
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
  'SUBSCRIPTION_EXTENDED',
]);

const REVENUECAT_API = 'https://api.revenuecat.com/v1';

type EntitlementFacts = {
  plan: Exclude<Plan, 'free'>;
  status: string;
  period_type: string | null;
  product_id: string | null;
  store: string;
  environment: string;
  expires_at: string | null;
  price: number | null;
  currency: string | null;
};

type RcEntitlement = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string;
  product_plan_identifier?: string | null;
};

type RcSubscription = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  period_type?: string;
  store?: string;
  is_sandbox?: boolean;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  price?: { amount?: number; currency?: string } | null;
};

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

function millis(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** Latest moment the entitlement grants access; Infinity for lifetime. */
function accessUntil(entitlement: RcEntitlement): number {
  if (entitlement.expires_date == null) return Infinity;
  return Math.max(
    millis(entitlement.expires_date) ?? 0,
    millis(entitlement.grace_period_expires_date) ?? 0,
  );
}

/**
 * Reduce a RevenueCat subscriber to one fact row: the best active entitlement
 * (Pro over Plus, then latest expiry), or an expired row when none is active.
 * Returns null when there is nothing worth storing.
 */
function factsFromSubscriber(
  subscriber: Json,
  eventType: string,
  fallbackPlan: Exclude<Plan, 'free'> | null,
): EntitlementFacts | null {
  const now = Date.now();
  const entitlements = (subscriber.entitlements ?? {}) as Record<string, RcEntitlement>;
  const subscriptions = (subscriber.subscriptions ?? {}) as Record<string, RcSubscription>;

  const candidates = Object.entries(entitlements)
    .map(([id, entitlement]) => ({
      entitlement,
      plan: planFromLabel(id) ?? planFromLabel(text(entitlement.product_identifier)),
      until: accessUntil(entitlement),
    }))
    .filter((candidate): candidate is typeof candidate & { plan: Exclude<Plan, 'free'> } => candidate.plan !== null);

  const active = candidates
    .filter((candidate) => candidate.until > now)
    .sort((a, b) => (a.plan === b.plan ? b.until - a.until : a.plan === 'pro' ? -1 : 1))[0];

  if (!active) {
    const lapsed = candidates.sort((a, b) => b.until - a.until)[0];
    const plan = lapsed?.plan ?? fallbackPlan;
    if (!plan) return null;
    return {
      plan,
      status: eventType === 'REFUND' ? 'refunded' : 'expired',
      period_type: null,
      product_id: text(lapsed?.entitlement.product_identifier) || null,
      store: 'REVENUECAT',
      environment: 'PRODUCTION',
      expires_at: lapsed && Number.isFinite(lapsed.until) && lapsed.until > 0
        ? new Date(lapsed.until).toISOString()
        : null,
      price: null,
      currency: null,
    };
  }

  const { entitlement, plan, until } = active;
  const productId = text(entitlement.product_identifier);
  const basePlan = text(entitlement.product_plan_identifier);
  const fullProductId = basePlan && !productId.includes(':') ? `${productId}:${basePlan}` : productId;
  // Play subscriptions are keyed either "product" or "product:basePlan".
  const subscription = subscriptions[fullProductId] ?? subscriptions[productId] ??
    Object.entries(subscriptions).find(([key]) => key.split(':')[0] === productId.split(':')[0])?.[1];

  const store = text(subscription?.store).toUpperCase();
  const periodType = text(subscription?.period_type).toUpperCase();
  const inGrace = (millis(subscription?.grace_period_expires_date) ?? 0) > now;
  let status: string;
  if (!subscription) status = 'prepaid';
  else if (subscription.billing_issues_detected_at && inGrace) status = 'billing_issue';
  else if (subscription.unsubscribe_detected_at) status = 'cancelled';
  else if (store === 'PROMOTIONAL' || periodType === 'PROMOTIONAL') status = 'promotional';
  else if (periodType === 'TRIAL') status = 'trial';
  else if (periodType === 'INTRO') status = 'introductory';
  else status = 'active';

  const amount = Number(subscription?.price?.amount);
  return {
    plan,
    status,
    period_type: periodType || null,
    product_id: fullProductId || null,
    store: store || 'REVENUECAT',
    environment: subscription?.is_sandbox ? 'SANDBOX' : 'PRODUCTION',
    expires_at: Number.isFinite(until) ? new Date(until).toISOString() : null,
    price: Number.isFinite(amount) ? amount : null,
    currency: text(subscription?.price?.currency).toUpperCase() || null,
  };
}

async function fetchSubscriber(apiKey: string, appUserId: string): Promise<{ subscriber?: Json; error?: string }> {
  try {
    const response = await fetch(`${REVENUECAT_API}/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { error: `revenuecat_api_${response.status}` };
    const body = await response.json() as Json;
    const subscriber = body.subscriber as Json | undefined;
    return subscriber ? { subscriber } : { error: 'revenuecat_api_no_subscriber' };
  } catch (error) {
    return { error: `revenuecat_api_unreachable:${error instanceof Error ? error.name : 'unknown'}` };
  }
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

  const knownPlan = derivePlan(entitlementIds, productId) ??
    (existingEntitlement?.plan as Exclude<Plan, 'free'> | undefined) ?? null;
  const externalId = eventAppUserId || originalAppUserId || appAccountToken || profile.id;
  const apiKey = text(Deno.env.get('REVENUECAT_API_KEY'));

  let facts: EntitlementFacts | null;
  let source: 'api' | 'event';
  if (apiKey) {
    source = 'api';
    const { subscriber, error } = await fetchSubscriber(apiKey, externalId);
    if (!subscriber) {
      // Not 'processed', so RevenueCat's retry is handled instead of skipped.
      console.error('[revenuecat-webhook] subscriber lookup failed:', error);
      await recordAudit({ resolved_user_id: profile.id, processing_status: 'rejected', error });
      return json(502, { error: 'revenuecat_lookup_failed' });
    }
    facts = factsFromSubscriber(subscriber, eventType, knownPlan);
  } else {
    source = 'event';
    console.warn('[revenuecat-webhook] REVENUECAT_API_KEY not set; trusting event state, which out-of-order events can corrupt');
    if (!knownPlan) {
      await recordAudit({
        resolved_user_id: profile.id,
        processing_status: 'rejected',
        error: 'cannot_determine_plan',
      });
      return json(422, { error: 'cannot_determine_plan' });
    }
    facts = {
      plan: knownPlan,
      status: billingStatus(eventType, periodType),
      period_type: periodType || null,
      product_id: productId || null,
      store: store || 'REVENUECAT',
      environment: environment || 'PRODUCTION',
      expires_at: isoFromMillis(event.expiration_at_ms),
      price: Number.isFinite(price) ? price : null,
      currency: currency || null,
    };
  }

  // No entitlement now and none before: nothing to store, but still recompute
  // so the profile reflects the other providers.
  if (facts) {
    const { error: entitlementError } = await admin
      .from('subscription_entitlements')
      .upsert({
        user_id: profile.id,
        provider: 'revenuecat',
        external_id: externalId,
        ...facts,
        last_event_id: eventId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' });

    if (entitlementError) {
      console.error('[revenuecat-webhook] entitlement update failed:', entitlementError.message);
      await recordAudit({ resolved_user_id: profile.id, derived_plan: facts.plan, processing_status: 'rejected', error: entitlementError.message });
      return json(500, { error: 'entitlement_update_failed' });
    }
  }

  const { data: effectiveRows, error: recomputeError } = await admin.rpc(
    'recompute_subscription_access',
    { p_user_id: profile.id },
  );
  if (recomputeError || !Array.isArray(effectiveRows) || !effectiveRows[0]) {
    const message = recomputeError?.message || 'subscription_recompute_returned_no_row';
    console.error('[revenuecat-webhook] subscription recompute failed:', message);
    await recordAudit({ resolved_user_id: profile.id, derived_plan: facts?.plan ?? null, processing_status: 'rejected', error: message });
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

  console.log(`[revenuecat-webhook] ${eventType}: user=${profile.id} source=${source} rc=${facts?.plan ?? 'none'}/${facts?.status ?? 'none'} effective=${effectivePlan}`);
  return json(200, { ok: true, event: eventType, plan: effectivePlan, billing_status: facts?.status ?? null });
});
