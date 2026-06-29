import type { SupabaseClient } from '@supabase/supabase-js';
import { isMonthlyLimitError, MonthlyLimitError } from '../utils/aiLimitError';

export type ExtractTimetableHttpResult = {
  httpStatus: number;
  data: unknown;
  rawText: string;
};

export async function invokeExtractTimetable(
  supabase: SupabaseClient,
  payload: { file_base64: string; mime_type: string },
): Promise<ExtractTimetableHttpResult> {
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
          message: userErr?.message || 'No valid session. Sign in again.',
        },
      },
    };
  }

  const { data, error, response } = await supabase.functions.invoke('extract_timetable', {
    body: payload,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!error && response) {
    const rawText =
      data !== undefined && data !== null && typeof data === 'object'
        ? JSON.stringify(data)
        : String(data ?? '');
    if (data && typeof data === 'object' && isMonthlyLimitError((data as { error?: unknown }).error as never)) {
      throw new MonthlyLimitError();
    }
    return { httpStatus: response.status, data, rawText };
  }

  const httpError = error as { context?: Response; message?: string };
  if (httpError?.context instanceof Response) {
    const res = httpError.context;
    const httpStatus = res.status;
    const rawText = await res.text();
    let parsed: unknown = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = {
        error: {
          message: rawText.slice(0, 600) || `Invalid response (HTTP ${httpStatus}).`,
          code: 'INVALID_RESPONSE',
        },
      };
    }
    if (parsed && typeof parsed === 'object' && isMonthlyLimitError((parsed as { error?: unknown }).error as never)) {
      throw new MonthlyLimitError();
    }
    return { httpStatus, data: parsed, rawText };
  }

  return {
    httpStatus: 0,
    rawText: '',
    data: { error: { message: error?.message ?? 'Edge function request failed', code: 'INVOKE_FAILED' } },
  };
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return globalThis.btoa(binary);
}
