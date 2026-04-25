import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/src/lib/supabase';
import { showMonthlyLimitAlert, isMonthlyLimitError } from '@/src/lib/aiLimitError';

export type ExtractTimetableHttpResult = {
  httpStatus: number;
  data: unknown;
  rawText: string;
};

export async function invokeExtractTimetable(payload: unknown): Promise<ExtractTimetableHttpResult> {
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
            'No valid session. Sign out, sign in again, then retry timetable import.',
        },
      },
    };
  }

  const { data, error, response } = await supabase.functions.invoke('extract_timetable', {
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
            `Empty or non-JSON response (HTTP ${httpStatus}). Is extract_timetable deployed?`,
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
