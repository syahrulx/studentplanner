/**
 * Shared monthly AI token quota helpers for Edge Functions.
 *
 * All AI-spending Edge Functions (ai_generate, generate_flashcards, extract_sow,
 * extract_timetable, ai_pdf_extract) import from this module to enforce a single
 * monthly budget per user regardless of which feature they use.
 *
 * Token sums are read via the `public.get_user_monthly_ai_tokens(p_user_id)`
 * RPC (see migration 057_ai_monthly_token_limit.sql).
 */

// Keep this in sync with the product-side pricing doc.
// Tune up/down without redeploying the app — just redeploy edge functions.
export const MONTHLY_TOKEN_LIMITS: Record<string, number> = {
  free: 20_000,
  plus: 200_000,
  pro: 1_000_000,
};

export const MONTHLY_LIMIT_ERROR_CODE = 'MONTHLY_TOKEN_LIMIT';

export function monthlyTokenLimitForPlan(plan: string | null | undefined): number {
  const key = (plan ?? 'free').toLowerCase();
  return MONTHLY_TOKEN_LIMITS[key] ?? MONTHLY_TOKEN_LIMITS.free;
}

/**
 * Combine the plan default with an optional per-user admin override. Callers
 * should pass the raw `profiles.ai_token_limit_override` column value.
 * A null/undefined/non-positive override falls back to the plan default.
 */
export function resolveMonthlyTokenLimit(
  plan: string | null | undefined,
  override: number | null | undefined,
): number {
  const base = monthlyTokenLimitForPlan(plan);
  const n = Number(override);
  if (!Number.isFinite(n) || n <= 0) return base;
  return Math.floor(n);
}

type SupabaseAdmin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: any }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/** Fetch the user's subscription plan (`free` | `plus` | `pro`). */
export async function getUserSubscriptionPlan(
  admin: SupabaseAdmin,
  userId: string,
): Promise<string> {
  const row = await getUserPlanRow(admin, userId);
  return row.plan;
}

/**
 * Fetch the user's plan and any admin-provided cap override in a single call.
 * Null/invalid override means "use the plan default".
 */
export async function getUserPlanRow(
  admin: SupabaseAdmin,
  userId: string,
): Promise<{ plan: string; override: number | null }> {
  try {
    const { data } = await admin
      .from('profiles')
      .select('subscription_plan,ai_token_limit_override')
      .eq('id', userId)
      .maybeSingle();
    const row = data as
      | { subscription_plan?: string; ai_token_limit_override?: number | null }
      | null;
    const plan =
      typeof row?.subscription_plan === 'string' && row.subscription_plan.length > 0
        ? row.subscription_plan
        : 'free';
    const rawOverride = row?.ai_token_limit_override;
    const override =
      typeof rawOverride === 'number' && Number.isFinite(rawOverride) && rawOverride > 0
        ? Math.floor(rawOverride)
        : null;
    return { plan, override };
  } catch {
    return { plan: 'free', override: null };
  }
}

/** Sum of `total_tokens` for the calling user since the start of this UTC month. */
export async function getMonthlyTokenUsage(
  admin: SupabaseAdmin,
  userId: string,
): Promise<number> {
  try {
    const { data, error } = await admin.rpc('get_user_monthly_ai_tokens', {
      p_user_id: userId,
    });
    if (error) return 0;
    const n = Number(data ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export interface MonthlyTokenCheck {
  allowed: boolean;
  used: number;
  limit: number;
  plan: string;
  remaining: number;
}

/**
 * Read plan + monthly usage in one call. Returns `allowed=false` if the user is
 * already at or over their monthly cap. Callers should reject the request with
 * code `MONTHLY_TOKEN_LIMIT_ERROR_CODE` when `allowed` is false.
 *
 * The per-user admin override on `profiles.ai_token_limit_override` (managed
 * from the admin panel) is honored before falling back to the plan default.
 */
export async function checkMonthlyTokenLimit(
  admin: SupabaseAdmin,
  userId: string,
  planOverride?: string,
): Promise<MonthlyTokenCheck> {
  // IMPORTANT: we always read the admin override from profiles, even when
  // callers hand us the plan directly. If we skipped this lookup, any custom
  // per-user cap set from the admin panel would be silently ignored and the
  // user would just get the plan default — the exact failure mode we hit when
  // an admin tried to tighten a free user's cap to 5k and they were still let
  // through at 20k.
  const row = await getUserPlanRow(admin, userId);
  const plan = planOverride ?? row.plan;
  const limit = resolveMonthlyTokenLimit(plan, row.override);
  const used = await getMonthlyTokenUsage(admin, userId);
  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, used, limit, plan, remaining };
}

/** Log a usage row (best-effort, never throws). */
export function logTokenUsage(
  admin: SupabaseAdmin,
  row: {
    user_id: string;
    kind: string;
    model: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
  },
): void {
  try {
    admin
      .from('ai_token_usage')
      .insert(row)
      .then(() => {}, () => {});
  } catch {
    // ignore
  }
}

/** Build the error message we ship back to clients when the cap is hit. */
export function formatMonthlyLimitMessage(check: MonthlyTokenCheck): string {
  const used = Math.round(check.used).toLocaleString();
  const limit = Math.round(check.limit).toLocaleString();
  return `Monthly AI token limit reached (${used}/${limit} for the ${check.plan} plan). Upgrade your plan to keep using AI this month.`;
}
