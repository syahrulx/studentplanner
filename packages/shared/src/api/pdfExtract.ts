import type { SupabaseClient } from '@supabase/supabase-js';
import { isMonthlyLimitError, MonthlyLimitError } from '../utils/aiLimitError';
import { NOTE_ATTACHMENTS_BUCKET } from './noteStorage';

export type PdfExtractStage =
  | 'local_pdfjs'
  | 'local_raw_fallback'
  | 'ai_upload'
  | 'ai_response'
  | 'done'
  | 'failed';

export type PdfExtractDebug = {
  text: string;
  stage: PdfExtractStage;
  detail?: string;
};

async function invokePdfExtractFromStorage(
  supabase: SupabaseClient,
  storagePath: string,
  bucket: string,
): Promise<PdfExtractDebug> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { text: '', stage: 'failed', detail: 'No active session.' };
  }

  const { data, error } = await supabase.functions.invoke('ai_pdf_extract', {
    body: { storage_path: storagePath, bucket },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    const ctx = (error as { context?: { status?: number; statusText?: string } }).context;
    const statusText = ctx ? `[HTTP ${ctx.status || 'unknown'} - ${ctx.statusText || 'unknown'}]` : '';
    const msg =
      typeof error === 'object' && error && 'message' in error
        ? `${(error as { message: string }).message} ${statusText}`
        : `${String(error)} ${statusText}`;
    return { text: '', stage: 'ai_response', detail: msg };
  }

  if (data?.error?.message) {
    if (isMonthlyLimitError(data.error)) {
      throw new MonthlyLimitError(data.error.message);
    }
    return { text: '', stage: 'ai_response', detail: data.error.message };
  }

  const outputText = (data?.text ?? '').trim();
  if (!outputText) {
    return { text: '', stage: 'ai_response', detail: 'Edge Function returned empty text.' };
  }

  return { text: outputText.slice(0, 120000), stage: 'done', detail: 'edge function extraction ok' };
}

export async function extractPdfTextFromStoragePath(
  supabase: SupabaseClient,
  storagePath: string,
  bucket: string = NOTE_ATTACHMENTS_BUCKET,
): Promise<PdfExtractDebug> {
  if (!storagePath?.trim()) {
    return { text: '', stage: 'failed', detail: 'Missing storage path.' };
  }
  return invokePdfExtractFromStorage(supabase, storagePath, bucket);
}
