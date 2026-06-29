import type { SupabaseClient } from '@supabase/supabase-js';
import { invokeAiGenerate, type AiGenerateQuizResult } from './invokeAiGenerate';

export type QuizType = 'mcq' | 'true_false' | 'mixed' | 'short_answer';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export type GeneratedQuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  expectedAnswer?: string;
  proof?: string;
};

export async function generateQuizFromNotes(
  supabase: SupabaseClient,
  noteContents: string[],
  questionCount: number,
  quizType: QuizType = 'mcq',
  difficulty: QuizDifficulty = 'medium',
): Promise<GeneratedQuizQuestion[]> {
  const MAX_CONTENT_CHARS = 12000;
  const combined = noteContents.join('\n\n---\n\n').slice(0, MAX_CONTENT_CHARS);
  if (!combined.trim()) return [];

  const { data, error } = await invokeAiGenerate<AiGenerateQuizResult>(supabase, {
    kind: 'quiz',
    content: combined,
    count: questionCount,
    quiz_type: quizType,
    difficulty,
  });

  if (error) throw new Error(error);
  return data?.questions ?? [];
}
