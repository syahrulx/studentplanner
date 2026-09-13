/**
 * Client helper to invoke the `generate_flashcards` Supabase Edge Function.
 *
 * This is the single entry point for ALL flashcard generation — text and PDF.
 * The Edge Function handles chunking, PDF extraction, rate limits, and dedup
 * server-side so the client only makes ONE request per generation.
 */
import { supabase } from './supabase';
import { showMonthlyLimitAlert, isMonthlyLimitError } from './aiLimitError';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerateFlashcardsRequest {
  /** 'text' = generate from raw note content, 'pdf_storage' = PDF on Supabase Storage */
  source: 'text' | 'pdf_storage';
  /** Raw note content (required for source=text) */
  content?: string;
  /** Supabase Storage path (required for source=pdf_storage) */
  storage_path?: string;
  /** Storage bucket name (default: note-attachments) */
  bucket?: string;
  /**
   * Max flashcards per request. The server clamps by subscription plan
   * (free 10 / plus 20 / pro 35 — see flashcardGenerationLimits.ts).
   */
  count?: number;
  /** Note ID (stored with generated cards, used for cache keys). Send for text AND pdf sources. */
  note_id?: string;
  /**
   * PDF only. Omit or "all" = full document (large PDFs may still be trimmed server-side).
   * Otherwise 1-based pages: "1-5", "3, 7, 10-12"
   */
  pdf_pages?: string;
}

export type GeneratedCardType = 'basic' | 'cloze' | 'concept';

export interface GeneratedCardPayload {
  front: string;
  back: string;
  /** Defaults to 'basic' when omitted. Cloze fronts contain `{{c1::answer}}` markup. */
  type?: GeneratedCardType;
  hint?: string | null;
  /** Short quote from the source the card was derived from. */
  source_excerpt?: string | null;
}

export interface GenerateFlashcardsResult {
  cards: GeneratedCardPayload[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    chunks_processed: number;
  };
  warnings?: string[];
  /** True when the server only used the first part of the source text. */
  truncated?: boolean;
  /** Approximate number of source characters actually used when `truncated`. */
  truncated_chars?: number;
}

/** Machine-readable error code returned in the Edge Function error envelope, when present. */
export interface GenerateFlashcardsError {
  message: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Invoke helper
// ---------------------------------------------------------------------------

export async function invokeGenerateFlashcards(
  body: GenerateFlashcardsRequest,
): Promise<{ data: GenerateFlashcardsResult | null; error?: string; errorCode?: string }> {
  // Check session exists
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) {
    return { data: null, error: 'No valid session. Please sign in again.' };
  }

  try {
    let { data, error } = await supabase.functions.invoke('generate_flashcards', { body });

    // Retry once on 401 (stale session)
    const status = (error as any)?.context?.status;
    if (error && status === 401) {
      await supabase.auth.refreshSession().catch(() => {});
      const { data: sessionCheck } = await supabase.auth.getSession();
      if (!sessionCheck.session?.access_token) {
        return { data: null, error: 'Session expired. Please sign in again.' };
      }
      const retried = await supabase.functions.invoke('generate_flashcards', { body });
      data = retried.data;
      error = retried.error;
    }

    if (error) {
      const ctx = (error as any).context;
      const statusText = ctx ? `[HTTP ${ctx.status || 'unknown'} - ${ctx.statusText || 'unknown'}]` : '';
      const message =
        typeof error === 'object' && 'message' in error
          ? `${(error as { message: string }).message} ${statusText}`
          : `${String(error)} ${statusText}`;
      if (ctx?.status === 401) {
        return {
          data: null,
          error: `${message}\nLikely auth mismatch. Please sign out/in and restart the app.`,
        };
      }
      return { data: null, error: message };
    }

    // Edge Function error envelope
    if (data?.error?.message) {
      const msg = String(data.error.message);
      const errorCode = typeof data.error.code === 'string' ? data.error.code : undefined;
      if (isMonthlyLimitError(data.error)) {
        showMonthlyLimitAlert();
        return { data: null, error: msg, errorCode };
      }
      if (/daily ai limit reached/i.test(msg)) {
        return { data: null, error: 'Daily AI limit reached. Please try again tomorrow.', errorCode };
      }
      if (/rate limit|rate_limit_exceeded|tokens per min|too many requests|openai error \(429\)/i.test(msg)) {
        return { data: null, error: 'OpenAI is rate-limited right now. Please retry in a few seconds.', errorCode };
      }
      return { data: null, error: msg, errorCode };
    }

    const result = (data ?? {}) as GenerateFlashcardsResult;
    if (!Array.isArray(result.cards)) result.cards = [];
    return { data: result };
  } catch (e: any) {
    return {
      data: null,
      error: e?.message || 'Flashcard generation request failed. Please try again.',
    };
  }
}
