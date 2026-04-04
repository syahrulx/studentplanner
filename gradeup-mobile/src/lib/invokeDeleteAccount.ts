import { supabase } from '@/src/lib/supabase';
import Constants from 'expo-constants';

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

  const accessToken = session!.access_token;
  const config = Constants.expoConfig?.extra || {};
  const supabaseUrl = config.supabaseUrl as string;
  const anonKey = config.supabaseAnonKey as string;

  if (!supabaseUrl || !anonKey) {
    return { ok: false, message: 'Missing Supabase URL/Key config', code: 'CONFIG_ERR' };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/delete_account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
    });

    const rawText = await res.text();
    let body: any = null;
    try { body = JSON.parse(rawText); } catch (e) {}

    if (res.ok) {
      if (body?.ok === true) return { ok: true };
      if (body?.error?.message) {
        return { ok: false, message: body.error.message, code: body.error.code };
      }
      return { ok: true };
    } else {
      const msg = body?.error?.message || rawText.slice(0, 200) || `HTTP ${res.status}`;
      return { ok: false, message: msg, code: body?.error?.code };
    }
  } catch (e: any) {
    return { ok: false, message: e.message || 'Edge function request failed', code: 'INVOKE_FAILED' };
  }
}
