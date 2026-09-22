/**
 * How long a Supabase request may run before it is aborted, by API surface.
 *
 * React Native's fetch has no default timeout, so a saturated backend leaves a
 * request pending forever instead of failing. Every screen that gates on one
 * then sits blank with no error and no way out.
 *
 * Kept free of React Native and Expo imports so the classification can be
 * tested directly — getting it wrong is expensive in both directions. Too
 * generous and the blank-screen hang returns; too aggressive and it cuts off
 * uploads and AI calls that are working exactly as intended.
 */

/** PostgREST and GoTrue. These answer in well under a second when healthy. */
export const FAST_PATH_TIMEOUT_MS = 15_000;

/**
 * Returns the timeout for a URL, or null when the request must not be capped.
 *
 * Storage carries whole PDFs and images over student mobile connections, and
 * Edge Functions run LLM calls that legitimately take a minute or more, so both
 * are left uncapped.
 */
export function timeoutForUrl(url: string): number | null {
  if (typeof url !== 'string' || url === '') return FAST_PATH_TIMEOUT_MS;
  if (url.includes('/storage/v1/')) return null;
  if (url.includes('/functions/v1/')) return null;
  return FAST_PATH_TIMEOUT_MS;
}

/** Normalises the several shapes fetch accepts into a URL string. */
export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href;
  return (input as Request)?.url ?? '';
}
