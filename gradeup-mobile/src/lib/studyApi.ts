/**
 * Study API – flashcards and quiz generation via Edge Functions.
 *
 * FLASHCARDS: All generation (text + PDF) goes through the unified
 * `generate_flashcards` Edge Function. The server handles chunking,
 * PDF extraction, rate limits, and dedup in a single request.
 *
 * QUIZ: Still uses the `ai_generate` Edge Function.
 *
 * SECURITY: All AI calls go through Supabase Edge Functions so the OpenAI
 * API key never appears in the client bundle.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  invokeGenerateFlashcards,
  type GenerateFlashcardsResult,
} from './invokeGenerateFlashcards';
import {
  invokeAiGenerate,
  type AiGenerateQuizResult,
} from './invokeAiGenerate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeneratedFlashcard = { front: string; back: string };

export type GeneratedQuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  /** For short-answer questions: the expected answer text */
  expectedAnswer?: string;
};

export type QuizType = 'mcq' | 'true_false' | 'mixed' | 'short_answer';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

// ---------------------------------------------------------------------------
// Flashcard generation — unified single-call via Edge Function
// ---------------------------------------------------------------------------

/**
 * Generate flashcards from note text content.
 * Single Edge Function call — server handles chunking + dedup.
 */
export async function generateFlashcardsFromNote(
  noteContent: string,
  _userId?: string,
  count: number = 10,
): Promise<GeneratedFlashcard[]> {
  if (!noteContent.trim()) return [];

  const { data, error } = await invokeGenerateFlashcards({
    source: 'text',
    content: noteContent,
    count,
  });

  if (error) {
    throw new Error(error);
  }

  return data?.cards ?? [];
}

/** True when the note has a storage path and the filename looks like a PDF. */
export function noteHasPdfAttachment(note: {
  attachmentPath?: string;
  attachmentFileName?: string;
}): boolean {
  if (!note.attachmentPath?.trim()) return false;
  const n = (note.attachmentFileName || '').toLowerCase();
  return n.endsWith('.pdf');
}

// ---------------------------------------------------------------------------
// Quiz generation (via ai_generate Edge Function — unchanged)
// ---------------------------------------------------------------------------

/**
 * Generate quiz questions from note contents.
 * Still proxied through the ai_generate Edge Function.
 */
export async function generateQuizFromNotes(
  noteContents: string[],
  questionCount: number,
  quizType: QuizType = 'mcq',
  difficulty: QuizDifficulty = 'medium',
  _userId?: string,
): Promise<GeneratedQuizQuestion[]> {
  const MAX_CONTENT_CHARS = 12000;
  const combined = noteContents.join('\n\n---\n\n').slice(0, MAX_CONTENT_CHARS);
  if (!combined.trim()) return [];

  const { data, error } = await invokeAiGenerate<AiGenerateQuizResult>({
    kind: 'quiz',
    content: combined,
    count: questionCount,
    quiz_type: quizType,
    difficulty,
  });

  if (error) {
    if (error.includes('timed out') || error.includes('RATE_LIMIT')) {
      throw new Error(error);
    }
    return [];
  }

  return data?.questions ?? [];
}

// ---------------------------------------------------------------------------
// Quiz AsyncStorage helpers (unchanged)
// ---------------------------------------------------------------------------

const QUIZ_TEMP_KEY = '@quiz_generated_store';

export async function setGeneratedQuizQuestions(questions: GeneratedQuizQuestion[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUIZ_TEMP_KEY, JSON.stringify(questions));
  } catch (e) {
    console.warn('Failed to save quiz to AsyncStorage', e);
  }
}

export async function getGeneratedQuizQuestions(): Promise<GeneratedQuizQuestion[]> {
  try {
    const data = await AsyncStorage.getItem(QUIZ_TEMP_KEY);
    if (!data) return [];
    return JSON.parse(data) as GeneratedQuizQuestion[];
  } catch {
    return [];
  }
}

export async function clearGeneratedQuizQuestions(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUIZ_TEMP_KEY);
  } catch {}
}

/**
 * @deprecated OpenAI key is no longer needed on the client.
 * AI generation now uses Edge Functions.
 * This function returns true to indicate "AI is available" since
 * the key is now stored server-side.
 */
export function getOpenAIKey(): string {
  // Return a truthy string so existing `if (!getOpenAIKey())` checks pass.
  return 'edge-function';
}
