import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/src/lib/supabase';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; message: string; code?: string };

/**
 * Calls Edge Function `delete_account` with the current session JWT.
 * Deploy: `supabase functions deploy delete_account` (needs service role on project).
 *
 * Note: Do not use getUser() here — with no/ stale session it returns "Auth session missing!"
 * even when refresh would succeed. We refresh first, then use access_token from getSession only.
 */
export async function invokeDeleteAccount(): Promise<DeleteAccountResult> {
  let { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const { data: ref, error: refErr } = await supabase.auth.refreshSession();
    session = ref.session ?? null;
    if (!session?.access_token) {
      return {
        ok: false,
        message: refErr?.message || 'No valid session. Sign in again.',
        code: 'NO_SESSION',
      };
    }
  }

  const accessToken = session.access_token;

  const { data, error } = await supabase.functions.invoke('delete_account', {
    method: 'POST',
    body: {},
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = data as { ok?: boolean; error?: { message?: string; code?: string } } | null;

  if (!error) {
    if (body && typeof body === 'object' && body.ok === true) return { ok: true };
    if (body?.error?.message) {
      return { ok: false, message: body.error.message, code: body.error.code };
    }
    return { ok: true };
  }

  // Non-2xx: body may still be in `data` for some SDK paths
  if (body?.error?.message) {
    return { ok: false, message: body.error.message, code: body.error.code };
  }

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const rawText = await res.text();
    try {
      const parsed = JSON.parse(rawText) as { error?: { message?: string; code?: string } };
      const msg = parsed?.error?.message || rawText.slice(0, 200) || `HTTP ${res.status}`;
      return { ok: false, message: msg, code: parsed?.error?.code };
    } catch {
      return { ok: false, message: rawText.slice(0, 200) || `HTTP ${res.status}` };
    }
  }

  const msg = error instanceof Error ? error.message : 'Edge function request failed';
  return { ok: false, message: msg, code: 'INVOKE_FAILED' };
}
