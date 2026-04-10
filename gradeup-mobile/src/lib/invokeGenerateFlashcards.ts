/**
 * Client helper to invoke the `generate_flashcards` Supabase Edge Function.
 *
 * This is the single entry point for ALL flashcard generation — text and PDF.
 * The Edge Function handles chunking, PDF extraction, rate limits, and dedup
 * server-side so the client only makes ONE request per generation.
 */
import { supabase } from './supabase';

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
  /** Max flashcards per request; server clamps by subscription (Free ≤12, Plus/Pro ≤30) */
  count?: number;
  /** Note ID for future cache key */
  note_id?: string;
}

export interface GenerateFlashcardsResult {
  cards: { front: string; back: string }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    chunks_processed: number;
  };
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Invoke helper
// ---------------------------------------------------------------------------

export async function invokeGenerateFlashcards(
  body: GenerateFlashcardsRequest,
): Promise<{ data: GenerateFlashcardsResult | null; error?: string }> {
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
      if (/daily ai limit reached/i.test(msg)) {
        return { data: null, error: 'Daily AI limit reached. Please try again tomorrow.' };
      }
      if (/rate limit|rate_limit_exceeded|tokens per min|too many requests|openai error \(429\)/i.test(msg)) {
        return { data: null, error: 'OpenAI is rate-limited right now. Please retry in a few seconds.' };
      }
      return { data: null, error: msg };
    }

    return { data: data as GenerateFlashcardsResult };
  } catch (e: any) {
    return {
      data: null,
      error: e?.message || 'Flashcard generation request failed. Please try again.',
    };
  }
}
