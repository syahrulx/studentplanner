import type { SupabaseClient } from '@supabase/supabase-js';
import { isMonthlyLimitError, MonthlyLimitError } from '../utils/aiLimitError';

export type AiGenerateKind = 'flashcards' | 'flashcards_pdf' | 'quiz' | 'task_extract' | 'chat';

export type AiGenerateRequest = {
  kind: AiGenerateKind;
  content: string;
  count?: number;
  quiz_type?: 'mcq' | 'true_false' | 'mixed' | 'short_answer';
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type AiGenerateQuizResult = {
  questions: {
    question: string;
    options: string[];
    correctIndex: number;
    expectedAnswer?: string;
    proof?: string;
  }[];
  error?: string;
};

export async function invokeAiGenerate<T = unknown>(
  supabase: SupabaseClient,
  body: AiGenerateRequest,
): Promise<{ data: T | null; error?: string }> {
  const hasSession = async (): Promise<boolean> => {
    const { data: sessionData } = await supabase.auth.getSession();
    return !!sessionData.session?.access_token;
  };

  if (!(await hasSession())) {
    return { data: null, error: 'No valid session. Please sign in again.' };
  }

  const MAX_ATTEMPTS = 2;
  const RETRY_DELAY_MS = 1500;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      let { data, error } = await supabase.functions.invoke('ai_generate', { body });

      const status = (error as { context?: { status?: number } })?.context?.status;
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
        const ctx = (error as { context?: { status?: number; statusText?: string } }).context;
        const httpStatus = ctx?.status;
        const statusText = ctx ? `[HTTP ${httpStatus || 'unknown'} - ${ctx.statusText || 'unknown'}]` : '';
        const message =
          typeof error === 'object' && error && 'message' in error
            ? `${(error as { message: string }).message} ${statusText}`
            : `${String(error)} ${statusText}`;

        const isTransient = (httpStatus ?? 0) >= 500 || !httpStatus || /timeout|abort|network|fetch/i.test(message);
        if (isTransient && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        return { data: null, error: message };
      }

      if (data?.error?.message) {
        if (isMonthlyLimitError(data.error)) {
          throw new MonthlyLimitError(data.error.message);
        }
        return { data: null, error: data.error.message };
      }

      return { data: data as T };
    } catch (e) {
      if (e instanceof MonthlyLimitError) throw e;
      const message = e instanceof Error ? e.message : 'AI generation request failed.';
      if (attempt < MAX_ATTEMPTS && /timeout|abort|network|fetch|ECONNRESET/i.test(message)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return { data: null, error: message };
    }
  }

  return { data: null, error: 'AI generation failed after retries.' };
}
