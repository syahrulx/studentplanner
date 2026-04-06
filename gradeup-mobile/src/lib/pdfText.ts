import * as FileSystem from 'expo-file-system/legacy';
import { getOpenAIKey } from './studyApi';
import { supabase } from './supabase';

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

/**
 * Extract text from a local file URI (e.g. from DocumentPicker).
 * Uploads to OpenAI Files API, extracts via Chat Completions, cleans up.
 */
export async function extractPdfTextFromLocalUri(
  fileUri: string,
  fileName?: string,
  userId?: string,
): Promise<PdfExtractDebug> {
  const key = getOpenAIKey();
  if (!key) return { text: '', stage: 'failed', detail: 'Missing OpenAI API key.' };

  let fileId: string | null = null;

  try {
    // Upload local file to OpenAI Files API
    const uploadFormData = new FormData();
    uploadFormData.append('purpose', 'assistants');
    uploadFormData.append('file', {
      uri: fileUri,
      name: fileName || 'document.pdf',
      type: 'application/pdf',
    } as any);

    const uploadCtrl = new AbortController();
    const uploadTimeout = setTimeout(() => uploadCtrl.abort(), 60000);
    const uploadRes = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      signal: uploadCtrl.signal,
      body: uploadFormData,
    });
    clearTimeout(uploadTimeout);

    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok || !uploadJson?.id) {
      return {
        text: '',
        stage: 'openai_upload',
        detail: uploadJson?.error?.message ?? `Upload failed (${uploadRes.status}).`,
      };
    }
    fileId = uploadJson.id;

    // Extract text via Chat Completions
    const chatCtrl = new AbortController();
    const chatTimeout = setTimeout(() => chatCtrl.abort(), 180000);
    const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: chatCtrl.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all readable educational text from this PDF document. Return plain text only. Preserve headings and structure. Ignore file metadata, page numbers, and formatting artifacts.' },
            { type: 'file', file: { file_id: fileId } },
          ],
        }],
        max_tokens: 16000,
      }),
    });
    clearTimeout(chatTimeout);

    const chatJson = await chatRes.json();
    if (!chatRes.ok) {
      return {
        text: '',
        stage: 'openai_response',
        detail: chatJson?.error?.message ?? `Chat failed (${chatRes.status}).`,
      };
    }

    // Token usage logging
    try {
      if (userId) {
        const usage = chatJson?.usage;
        await supabase.from('ai_token_usage').insert({
          user_id: userId,
          kind: 'pdf_text_extraction',
          model: 'gpt-4o-mini',
          prompt_tokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
          completion_tokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
          total_tokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : null,
        });
      }
    } catch {
      // ignore
    }

    const outputText = (chatJson?.choices?.[0]?.message?.content ?? '').trim();
    if (!outputText) {
      return { text: '', stage: 'openai_response', detail: 'OpenAI returned empty output text.' };
    }
    return { text: outputText.slice(0, 120000), stage: 'done', detail: 'local uri extraction ok' };

  } catch (error) {
    return {
      text: '',
      stage: 'failed',
      detail: error instanceof Error ? error.message : 'Unknown extraction error.',
    };
  } finally {
    // Clean up OpenAI file (best-effort)
    if (fileId) {
      fetch(`https://api.openai.com/v1/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getOpenAIKey() ?? ''}` },
      }).catch(() => {});
    }
  }
}

/** Convenience alias used by notes-list.tsx */
export const extractPdfTextFromUri = async (uri: string, _maxPages?: number): Promise<string> => {
  const result = await extractPdfTextFromLocalUri(uri);
  return result.text;
};

/**
 * AI-only PDF extraction using OpenAI Files API.
 * Downloads the PDF to a temp local file (Hermes-compatible),
 * uploads it to OpenAI, extracts text via Chat Completions, then cleans up.
 */
export async function extractPdfTextFromUrlDebug(
  url: string,
  userId?: string,
  _maxPages?: number,
): Promise<PdfExtractDebug> {
  const key = getOpenAIKey();
  if (!key) return { text: '', stage: 'failed', detail: 'Missing OpenAI API key.' };

  // Use a temp local path — React Native/Hermes requires a file URI for binary uploads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cacheDir = (FileSystem as any).cacheDirectory as string | null;
  const tempPath = `${cacheDir ?? ''}quiz_pdf_${Date.now()}.pdf`;
  let fileId: string | null = null;

  try {
    // Step 1: Download PDF to temp file
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadResult = await (FileSystem as any).downloadAsync(url, tempPath) as { status: number };
    if (downloadResult.status !== 200) {
      return { text: '', stage: 'failed', detail: `PDF download failed (HTTP ${downloadResult.status}).` };
    }

    // Step 2: Upload to OpenAI Files API using local file URI (Hermes-safe FormData pattern)
    const uploadFormData = new FormData();
    uploadFormData.append('purpose', 'assistants');
    uploadFormData.append('file', {
      uri: tempPath,
      name: 'note.pdf',
      type: 'application/pdf',
    } as any);

    const uploadCtrl = new AbortController();
    const uploadTimeout = setTimeout(() => uploadCtrl.abort(), 60000); // 60s for upload
    const uploadRes = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      signal: uploadCtrl.signal,
      body: uploadFormData,
    });
    clearTimeout(uploadTimeout);

    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok || !uploadJson?.id) {
      return {
        text: '',
        stage: 'openai_upload',
        detail: uploadJson?.error?.message ?? `Upload failed (${uploadRes.status}).`,
      };
    }
    fileId = uploadJson.id;

    // Step 3: Extract text via Chat Completions referencing the file_id
    const chatCtrl = new AbortController();
    const chatTimeout = setTimeout(() => chatCtrl.abort(), 180000); // 180s for AI to read PDF
    const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: chatCtrl.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all readable educational text from this PDF document. Return plain text only. Ignore file metadata, page numbers, and structural markup.' },
            { type: 'file', file: { file_id: fileId } },
          ],
        }],
        max_tokens: 8000,
      }),
    });
    clearTimeout(chatTimeout);

    const chatJson = await chatRes.json();
    if (!chatRes.ok) {
      return {
        text: '',
        stage: 'openai_response',
        detail: chatJson?.error?.message ?? `Chat failed (${chatRes.status}).`,
      };
    }

    // Best-effort token usage logging (never break extraction if logging fails).
    try {
      if (userId) {
        const usage = chatJson?.usage;
        await supabase.from('ai_token_usage').insert({
          user_id: userId,
          kind: 'pdf_text_extraction',
          model: 'gpt-4o-mini',
          prompt_tokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
          completion_tokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
          total_tokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : null,
        });
      }
    } catch {
      // ignore
    }

    const outputText = (chatJson?.choices?.[0]?.message?.content ?? '').trim();
    if (!outputText) {
      return { text: '', stage: 'openai_response', detail: 'OpenAI returned empty output text.' };
    }
    return { text: outputText.slice(0, 120000), stage: 'done', detail: 'openai extraction ok' };

  } catch (error) {
    return {
      text: '',
      stage: 'failed',
      detail: error instanceof Error ? error.message : 'Unknown extraction error.',
    };
  } finally {
    // Clean up temp file (best-effort)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (FileSystem as any).deleteAsync?.(tempPath, { idempotent: true }).catch(() => {});
    // Clean up OpenAI file (best-effort)
    if (fileId) {
      fetch(`https://api.openai.com/v1/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getOpenAIKey() ?? ''}` },
      }).catch(() => {});
    }
  }
}
