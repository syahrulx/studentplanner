/**
 * Client helper to invoke the `ai_generate` Supabase Edge Function.
 * All AI generation (flashcards, quiz) now goes through the server
 * so the OpenAI API key never touches the client bundle.
 */
import { supabase } from './supabase';
import { showMonthlyLimitAlert, isMonthlyLimitError } from './aiLimitError';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiGenerateKind = 'flashcards' | 'flashcards_pdf' | 'quiz' | 'task_extract' | 'chat' | 'handwriting_recognize';

export interface AiGenerateRequest {
  kind: AiGenerateKind;
  content: string;
  count?: number;
  quiz_type?: 'mcq' | 'true_false' | 'mixed' | 'short_answer';
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Quiz: note ids parallel to the `[Study source N]` blocks in `content`, for per-note mastery. */
  source_note_ids?: string[];
  today_iso?: string;
  current_week?: number;
  courses?: { id: string; name: string }[];
  chat_history?: { role: 'user' | 'assistant'; content: string }[];
  /** RAG: the user's question to embed and search for relevant chunks. */
  question?: string;
  /** RAG: the subject ID to scope embedding search. */
  subject_id?: string;
  /** Base64-encoded image for vision analysis in chat. */
  image_base64?: string;
  /** MIME type of `image_base64` (e.g. 'image/png'). Server defaults to image/jpeg when absent. */
  image_mime?: string;
  /** Chat: human-readable course name shown to the model and used for domain inference. */
  subject_name?: string;
  /** Chat: UI language code (e.g. 'en' | 'ms') — the model answers in this language. */
  language?: string;
  /** Chat: titles of the notes included in `content`, so the server can cite "[Note: title]" for RAG chunks. */
  note_titles?: { id: string; title: string }[];
  /** Optional normalized crop hint for handwriting OCR. */
  selection_hint?: { left: number; top: number; right: number; bottom: number };
}

export type AiGenerateFlashcardsResult = {
  cards: { front: string; back: string }[];
  error?: string;
};

export type AiGenerateQuizResult = {
  questions: {
    question: string;
    options: string[];
    /** -1 for short-answer questions. */
    correctIndex: number;
    kind?: 'mcq' | 'true_false' | 'short_answer';
    expectedAnswer?: string | null;
    acceptedAnswers?: string[] | null;
    /** 2-3 sentences: why the answer is right and why distractors are wrong. */
    explanation?: string | null;
    proof?: string | null;
    /** 0-based index into the `[Study source N]` blocks the client sent. */
    sourceIndex?: number | null;
    bloomLevel?: 'remember' | 'understand' | 'apply' | 'analyze' | null;
  }[];
  quality?: {
    requested: number;
    generated: number;
    repaired: boolean;
    partial: boolean;
  };
  error?: string;
};

export type AiGenerateTaskExtractResult = {
  tasks: {
    title: string;
    course_id: string;
    type: string;
    /** When the same task has multiple due dates, AI can return them here. */
    due_dates?: (string | null)[];
    due_date: string | null;
    due_time: string;
    needs_date?: boolean;
    priority?: string;
    effort_hours?: number;
    notes?: string;
    deadline_risk?: string;
    suggested_week?: number;
    confidence?: number;
    is_inferred_date?: boolean;
    is_unknown_course?: boolean;
  }[];
  error?: string;
};

export type AiGenerateChatCitation = { note_id: string; title: string };

export type AiGenerateChatResult = {
  response: string;
  citations?: AiGenerateChatCitation[];
  error?: string;
};

export type AiGenerateHandwritingResult = {
  text: string;
  lines?: string[];
  error?: string;
};

// ---------------------------------------------------------------------------
// Invoke helper
// ---------------------------------------------------------------------------

export async function invokeAiGenerate<T = unknown>(
  body: AiGenerateRequest,
): Promise<{ data: T | null; error?: string }> {
  const hasSession = async (): Promise<boolean> => {
    const { data: sessionData } = await supabase.auth.getSession();
    return !!sessionData.session?.access_token;
  };

  if (!(await hasSession())) {
    return { data: null, error: 'No valid session. Please sign in again.' };
  }

  // Retry config: up to 2 attempts (1 original + 1 retry) for transient failures
  const MAX_ATTEMPTS = 2;
  const RETRY_DELAY_MS = 1500;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Let supabase-js forward apikey + user session automatically.
      let { data, error } = await supabase.functions.invoke('ai_generate', { body });

      // Session may be stale/expired. Refresh once and retry on 401.
      const status = (error as any)?.context?.status;
      if (error && status === 401) {
        await supabase.auth.refreshSession().catch(() => {});
        if (!(await hasSession())) {
          return { data: null, error: 'Session expired. Please sign in again.' };
        }
        const retried = await supabase.functions.invoke('ai_generate', { body });
        data = retried.data;
        error = retried.error;
      }

      if (error) {
        // supabase-js wraps non-2xx responses
        const ctx = (error as any).context;
        const httpStatus = ctx?.status;
        const statusText = ctx ? `[HTTP ${httpStatus || 'unknown'} - ${ctx.statusText || 'unknown'}]` : '';
        const message =
          typeof error === 'object' && 'message' in error
            ? `${(error as { message: string }).message} ${statusText}`
            : `${String(error)} ${statusText}`;

        if (ctx?.status === 401) {
          return {
            data: null,
            error:
              `${message}\nLikely auth mismatch. Please sign out/in and restart the app.`,
          };
        }

        // Retry on transient errors (5xx, timeout, network issues)
        const isTransient = httpStatus >= 500 || !httpStatus || /timeout|abort|network|fetch/i.test(message);
        if (isTransient && attempt < MAX_ATTEMPTS) {
          console.log(`[invokeAiGenerate] Attempt ${attempt} failed (transient): ${message}. Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }

        return { data: null, error: message };
      }

      // Edge Function returns { error: { message, code } } on failure
      if (data?.error?.message) {
        if (isMonthlyLimitError(data.error)) {
          showMonthlyLimitAlert();
        }
        const edgeCode = String(data.error.code ?? '');
        const edgeMessage = String(data.error.message);
        const retryableProviderFailure = edgeCode === 'OPENAI_ERROR' && /temporarily|busy|took too long|try again/i.test(edgeMessage);
        if (retryableProviderFailure && attempt < MAX_ATTEMPTS) {
          console.log(`[invokeAiGenerate] AI provider unavailable on attempt ${attempt}; retrying…`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        return { data: null, error: edgeMessage };
      }

      return { data: data as T };
    } catch (e: any) {
      const message = e?.message || 'AI generation request failed. Please try again.';

      // Retry on transient exceptions (network errors, timeouts)
      if (attempt < MAX_ATTEMPTS && /timeout|abort|network|fetch|ECONNRESET/i.test(message)) {
        console.log(`[invokeAiGenerate] Attempt ${attempt} exception (transient): ${message}. Retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      return { data: null, error: message };
    }
  }

  // Should not reach here, but safety fallback
  return { data: null, error: 'AI generation failed after retries.' };
}

export async function invokeAiEmbed(
  body: { noteId: string; subjectId: string; content: string }
): Promise<{ success: boolean; chunksProcessed?: number; tokens?: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('ai_embed', { body });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data?.error) {
      const err = data.error;
      const message = typeof err === 'string' ? err : String(err?.message ?? 'AI embedding failed');
      return { success: false, error: message };
    }
    return {
      success: data?.success !== false,
      chunksProcessed: typeof data?.chunksProcessed === 'number' ? data.chunksProcessed : undefined,
      tokens: typeof data?.tokens === 'number' ? data.tokens : undefined,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'AI embedding failed' };
  }
}
