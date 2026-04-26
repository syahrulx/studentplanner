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

export type AiGenerateKind = 'flashcards' | 'flashcards_pdf' | 'quiz' | 'task_extract';

export interface AiGenerateRequest {
  kind: AiGenerateKind;
  content: string;
  count?: number;
  quiz_type?: 'mcq' | 'true_false' | 'mixed' | 'short_answer';
  difficulty?: 'easy' | 'medium' | 'hard';
  today_iso?: string;
  current_week?: number;
  courses?: { id: string; name: string }[];
}

export type AiGenerateFlashcardsResult = {
  cards: { front: string; back: string }[];
  error?: string;
};

export type AiGenerateQuizResult = {
  questions: {
    question: string;
    options: string[];
    correctIndex: number;
    expectedAnswer?: string;
  }[];
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
      const statusText = ctx ? `[HTTP ${ctx.status || 'unknown'} - ${ctx.statusText || 'unknown'}]` : '';
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
      return { data: null, error: message };
    }

    // Edge Function returns { error: { message, code } } on failure
    if (data?.error?.message) {
      if (isMonthlyLimitError(data.error)) {
        showMonthlyLimitAlert();
      }
      return { data: null, error: data.error.message };
    }

    return { data: data as T };
  } catch (e: any) {
    return {
      data: null,
      error: e?.message || 'AI generation request failed. Please try again.',
    };
  }
}
