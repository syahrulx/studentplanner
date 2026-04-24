import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/src/lib/supabase';
import { showMonthlyLimitAlert, isMonthlyLimitError } from '@/src/lib/aiLimitError';

export type ExtractSowHttpResult = {
  httpStatus: number;
  data: unknown;
  rawText: string;
};

/**
 * Invoke extract_sow via the shared Supabase client so `apikey` matches Storage/Auth.
 * We set Authorization explicitly from getSession() right before the call so we never
 * rely on a stale closure token. (fetchWithAuth would do the same, but this is explicit.)
 */
export async function invokeExtractSow(payload: unknown): Promise<ExtractSowHttpResult> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (userErr || !userData.user || !accessToken) {
    return {
      httpStatus: 401,
      rawText: '',
      data: {
        error: {
          code: 'NO_SESSION',
          message:
            userErr?.message ||
            'No valid session. Sign out, sign in again, then retry SOW import.',
        },
      },
    };
  }

  const { data, error, response } = await supabase.functions.invoke('extract_sow', {
    body: payload as Record<string, unknown>,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!error && response) {
    const rawText =
      data !== undefined && data !== null && typeof data === 'object'
        ? JSON.stringify(data)
        : String(data ?? '');
    if (data && typeof data === 'object' && isMonthlyLimitError((data as { error?: unknown }).error as never)) {
      showMonthlyLimitAlert();
    }
    return { httpStatus: response.status, data, rawText };
  }

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const httpStatus = res.status;
    const rawText = await res.text();
    let parsed: unknown = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = {
        error: {
          message:
            rawText.slice(0, 600) ||
            `Empty or non-JSON response (HTTP ${httpStatus}). Is extract_sow deployed?`,
          code: 'INVALID_RESPONSE',
        },
      };
    }
    if (parsed && typeof parsed === 'object' && isMonthlyLimitError((parsed as { error?: unknown }).error as never)) {
      showMonthlyLimitAlert();
    }
    return { httpStatus, data: parsed, rawText };
  }

  const msg = error instanceof Error ? error.message : 'Edge function request failed';
  return {
    httpStatus: 0,
    rawText: '',
    data: { error: { message: msg, code: 'INVOKE_FAILED' } },
  };
}
