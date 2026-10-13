/** Read a message from anything thrown (Error, Supabase error object, …). Same as `e?.message || fallback`. */
export function errorText(e: unknown, fallback: string): string {
  const msg = (e as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}
