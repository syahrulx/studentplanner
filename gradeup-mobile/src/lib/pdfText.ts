/**
 * PDF text extraction — now proxied through the ai_pdf_extract Edge Function.
 *
 * SECURITY: The OpenAI API key is no longer used client-side.
 * All PDF → text extraction happens server-side via the Edge Function.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { uploadNoteAttachment, NOTE_ATTACHMENTS_BUCKET } from './noteStorage';
import { showMonthlyLimitAlert, isMonthlyLimitError } from './aiLimitError';

export type PdfExtractStage =
  | 'local_pdfjs'
  | 'local_raw_fallback'
  | 'openai_upload'
  | 'openai_response'
  | 'done'
  | 'failed';

export type PdfExtractDebug = {
  text: string;
  stage: PdfExtractStage;
  detail?: string;
};

export async function extractPdfTextFromUrl(url: string, _maxPages?: number): Promise<string> {
  const debug = await extractPdfTextFromUrlDebug(url);
  return debug.text;
}

async function invokePdfExtractFromStorage(storagePath: string, bucket: string): Promise<PdfExtractDebug> {
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
    const ctx = (error as any).context;
    const statusText = ctx ? `[HTTP ${ctx.status || 'unknown'} - ${ctx.statusText || 'unknown'}]` : '';
    const msg = typeof error === 'object' && 'message' in error
      ? `${(error as { message: string }).message} ${statusText}`
      : `${String(error)} ${statusText}`;
    return { text: '', stage: 'openai_response', detail: msg };
  }

  if (data?.error?.message) {
    if (isMonthlyLimitError(data.error)) {
      showMonthlyLimitAlert();
    }
    return { text: '', stage: 'openai_response', detail: data.error.message };
  }

  const outputText = (data?.text ?? '').trim();
  if (!outputText) {
    return { text: '', stage: 'openai_response', detail: 'Edge Function returned empty text.' };
  }

  return { text: outputText.slice(0, 120000), stage: 'done', detail: 'edge function extraction ok' };
}

/**
 * Extract text from a local file URI (e.g. from DocumentPicker).
 * Uploads the file to Supabase Storage temporarily, then calls the
 * ai_pdf_extract Edge Function to extract text server-side.
 */
export async function extractPdfTextFromLocalUri(
  fileUri: string,
  fileName?: string,
  userId?: string,
): Promise<PdfExtractDebug> {
  if (!userId) {
    // Try to get current user
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id;
  }
  if (!userId) {
    return { text: '', stage: 'failed', detail: 'Not authenticated.' };
  }

  const safeName = fileName || `temp_pdf_${Date.now()}.pdf`;
  const tempNoteId = `_pdf_extract_${Date.now()}`;

  try {
    // Step 1: Upload PDF to Supabase Storage (temp path)
    const { path, error: uploadErr } = await uploadNoteAttachment(
      userId,
      tempNoteId,
      fileUri,
      safeName,
      'application/pdf',
    );

    if (uploadErr || !path) {
      return {
        text: '',
        stage: 'openai_upload',
        detail: uploadErr?.message ?? 'Failed to upload PDF to storage.',
      };
    }

    // Step 2: Call Edge Function to extract text from uploaded path
    return await invokePdfExtractFromStorage(path, NOTE_ATTACHMENTS_BUCKET);
  } catch (error) {
    return {
      text: '',
      stage: 'failed',
      detail: error instanceof Error ? error.message : 'Unknown extraction error.',
    };
  } finally {
    // Clean up temp file from storage (best-effort)
    supabase.storage
      .from(NOTE_ATTACHMENTS_BUCKET)
      .remove([`${userId}/${tempNoteId}/${safeName}`])
      .catch(() => {});
  }
}

/**
 * Extract text directly from an existing storage path (already uploaded PDF).
 * This avoids local download and temporary re-upload.
 */
export async function extractPdfTextFromStoragePath(
  storagePath: string,
  bucket: string = NOTE_ATTACHMENTS_BUCKET,
): Promise<PdfExtractDebug> {
  if (!storagePath?.trim()) {
    return { text: '', stage: 'failed', detail: 'Missing storage path.' };
  }
  return invokePdfExtractFromStorage(storagePath, bucket);
}

/** Convenience alias used by notes-list.tsx */
export const extractPdfTextFromUri = async (uri: string, _maxPages?: number): Promise<string> => {
  const result = await extractPdfTextFromLocalUri(uri);
  return result.text;
};

/**
 * AI PDF extraction via Edge Function.
 * Downloads the PDF to a temp local file, uploads to Supabase Storage,
 * then calls the ai_pdf_extract Edge Function.
 */
export async function extractPdfTextFromUrlDebug(
  url: string,
  userId?: string,
  _maxPages?: number,
): Promise<PdfExtractDebug> {
  if (!userId) {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id;
  }
  if (!userId) {
    return { text: '', stage: 'failed', detail: 'Not authenticated.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cacheDir = (FileSystem as any).cacheDirectory as string | null;
  const tempPath = `${cacheDir ?? ''}quiz_pdf_${Date.now()}.pdf`;

  try {
    // Step 1: Download PDF to temp file
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadResult = await (FileSystem as any).downloadAsync(url, tempPath) as { status: number };
    if (downloadResult.status !== 200) {
      return { text: '', stage: 'failed', detail: `PDF download failed (HTTP ${downloadResult.status}).` };
    }

    // Step 2: Use the local URI extraction path (uploads to storage → calls Edge Function)
    return await extractPdfTextFromLocalUri(tempPath, 'note.pdf', userId);
  } catch (error) {
    return {
      text: '',
      stage: 'failed',
      detail: error instanceof Error ? error.message : 'Unknown extraction error.',
    };
  } finally {
    // Clean up temp file
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (FileSystem as any).deleteAsync?.(tempPath, { idempotent: true }).catch(() => {});
  }
}

/**
 * @deprecated No longer used — kept for backward compatibility.
 */
export function getOpenAIKey(): string {
  return 'edge-function';
}
