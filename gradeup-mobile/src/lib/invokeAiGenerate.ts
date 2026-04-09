/**
 * Client helper to invoke the `ai_generate` Supabase Edge Function.
 * All AI generation (flashcards, quiz) now goes through the server
 * so the OpenAI API key never touches the client bundle.
 */
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiGenerateKind = 'flashcards' | 'flashcards_pdf' | 'quiz';

export interface AiGenerateRequest {
  kind: AiGenerateKind;
  content: string;
  count?: number;
  quiz_type?: 'mcq' | 'true_false' | 'mixed' | 'short_answer';
  difficulty?: 'easy' | 'medium' | 'hard';
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

// ---------------------------------------------------------------------------
// Invoke helper
// ---------------------------------------------------------------------------

export async function invokeAiGenerate<T = unknown>(
  body: AiGenerateRequest,
): Promise<{ data: T | null; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    return { data: null, error: 'No valid session. Please sign in again.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('ai_generate', {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) {
      // supabase-js wraps non-2xx responses
      const ctx = (error as any).context;
      const statusText = ctx ? `[HTTP ${ctx.status || 'unknown'} - ${ctx.statusText || 'unknown'}]` : '';
      const message =
        typeof error === 'object' && 'message' in error
          ? `${(error as { message: string }).message} ${statusText}`
          : `${String(error)} ${statusText}`;
      return { data: null, error: message };
    }

    // Edge Function returns { error: { message, code } } on failure
    if (data?.error?.message) {
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
