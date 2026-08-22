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
import { supabase } from './supabase';
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
  /** Brief reason/excerpt that supports why the answer is correct. */
  proof?: string;
};

export type SavedQuizItem = {
  id: string;
  title: string;
  createdAt: string;
  questionCount: number;
  sourceType: 'notes' | 'flashcards';
  sourceId?: string;
  quizType?: QuizType;
  difficulty?: QuizDifficulty;
  questions: GeneratedQuizQuestion[];
};

export type QuizType = 'mcq' | 'true_false' | 'mixed' | 'short_answer';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

function buildBalancedQuizSource(noteContents: string[], maxChars = 14500): string {
  const sources = noteContents
    .map((content) => String(content ?? '').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim())
    .filter((content) => content.length >= 20);
  if (sources.length === 0) return '';

  // Round-robin chunks stop the first large PDF from consuming the complete
  // context window while later selected notes contribute nothing.
  const cursors = sources.map(() => 0);
  const pieces: string[] = [];
  let remaining = maxChars;
  let madeProgress = true;
  while (remaining > 80 && madeProgress) {
    madeProgress = false;
    for (let index = 0; index < sources.length && remaining > 80; index++) {
      if (cursors[index] >= sources[index].length) continue;
      const label = `\n\n[Study source ${index + 1}]\n`;
      const take = Math.min(1400, sources[index].length - cursors[index], remaining - label.length);
      if (take <= 0) continue;
      pieces.push(label, sources[index].slice(cursors[index], cursors[index] + take));
      cursors[index] += take;
      remaining -= label.length + take;
      madeProgress = true;
    }
  }
  return pieces.join('').slice(0, maxChars).trim();
}

function normalizeGeneratedQuizQuestions(
  raw: GeneratedQuizQuestion[],
  quizType: QuizType,
  requestedCount: number,
): GeneratedQuizQuestion[] {
  const accepted: GeneratedQuizQuestion[] = [];
  const seen = new Set<string>();
  let trueAnswers = 0;
  let falseAnswers = 0;
  const kindCounts = { mcq: 0, true_false: 0, short_answer: 0 };
  const mcqOffset = Math.floor(Math.random() * 4);

  for (const candidate of Array.isArray(raw) ? raw : []) {
    if (accepted.length >= requestedCount) break;
    if (!candidate || typeof candidate !== 'object') continue;
    const question = String(candidate.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const key = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (question.length < 8 || !key || seen.has(key)) continue;
    const proof = candidate.proof ? String(candidate.proof).replace(/\s+/g, ' ').trim().slice(0, 160) : undefined;
    if (!proof || proof.length < 3) continue;
    const options = Array.isArray(candidate.options)
      ? candidate.options.map((option) => String(option ?? '').replace(/\s+/g, ' ').trim().slice(0, 250))
      : [];
    const correctIndex = Number(candidate.correctIndex);

    if (options.length === 0) {
      const expectedAnswer = String(candidate.expectedAnswer ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if ((quizType !== 'short_answer' && quizType !== 'mixed') || !expectedAnswer) continue;
      accepted.push({ question, options: [], correctIndex: -1, expectedAnswer, proof });
      kindCounts.short_answer += 1;
      seen.add(key);
      continue;
    }

    const trueIndex = options.findIndex((option) => option.toLowerCase() === 'true');
    const falseIndex = options.findIndex((option) => option.toLowerCase() === 'false');
    if (options.length === 2 && trueIndex >= 0 && falseIndex >= 0) {
      if ((quizType !== 'true_false' && quizType !== 'mixed') || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 1) continue;
      const normalizedCorrect = options[correctIndex].toLowerCase() === 'true' ? 0 : 1;
      if (normalizedCorrect === 0) trueAnswers += 1;
      else falseAnswers += 1;
      accepted.push({ question, options: ['True', 'False'], correctIndex: normalizedCorrect, proof });
      kindCounts.true_false += 1;
      seen.add(key);
      continue;
    }

    if ((quizType !== 'mcq' && quizType !== 'mixed') || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) continue;
    const correct = options[correctIndex];
    const wrongSeen = new Set<string>();
    const uniqueWrong = options.filter((option, index) => {
      const normalized = option.toLowerCase();
      if (index === correctIndex || !option || normalized === correct.toLowerCase() || wrongSeen.has(normalized)) return false;
      wrongSeen.add(normalized);
      return true;
    });
    if (!correct || uniqueWrong.length < 3) continue;
    for (let index = uniqueWrong.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [uniqueWrong[index], uniqueWrong[swap]] = [uniqueWrong[swap], uniqueWrong[index]];
    }
    const finalOptions = uniqueWrong.slice(0, 3);
    const target = (mcqOffset + accepted.length) % 4;
    finalOptions.splice(target, 0, correct);
    accepted.push({ question, options: finalOptions, correctIndex: target, proof });
    kindCounts.mcq += 1;
    seen.add(key);
  }

  const trueFalseTotal = trueAnswers + falseAnswers;
  if (trueFalseTotal >= 4 && Math.max(trueAnswers, falseAnswers) / trueFalseTotal > 0.75) {
    throw new Error('The generated True/False answers were too one-sided. Please regenerate for a fairer quiz.');
  }
  if (quizType === 'mixed' && requestedCount >= 6 && Object.values(kindCounts).some((count) => count === 0)) {
    throw new Error('The generated quiz did not contain a balanced mix of question types. Please regenerate it.');
  }
  const minimumUsable = Math.min(requestedCount, Math.max(1, Math.ceil(requestedCount * 0.7)));
  if (accepted.length < minimumUsable) {
    throw new Error(`Only ${accepted.length} of ${requestedCount} questions passed quality checks. Please try again.`);
  }
  return accepted;
}

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
  const combined = buildBalancedQuizSource(noteContents);
  if (!combined.trim()) return [];

  const { data, error } = await invokeAiGenerate<AiGenerateQuizResult>({
    kind: 'quiz',
    content: combined,
    count: questionCount,
    quiz_type: quizType,
    difficulty,
  });

  if (error) {
    // Do not turn a server failure into an empty quiz. That hid the actual
    // reason (for example a temporary AI-provider issue) behind a misleading
    // "try different notes" message.
    throw new Error(error);
  }

  return normalizeGeneratedQuizQuestions(data?.questions ?? [], quizType, questionCount);
}

// ---------------------------------------------------------------------------
// Quiz AsyncStorage helpers (unchanged)
// ---------------------------------------------------------------------------

const QUIZ_TEMP_KEY = '@quiz_generated_store';

async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  return session.user.id;
}

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

export async function getSavedQuizzes(): Promise<SavedQuizItem[]> {
  try {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('saved_quizzes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getSavedQuizzes error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      questionCount: row.question_count,
      sourceType: row.source_type,
      sourceId: row.source_id,
      quizType: row.quiz_type,
      difficulty: row.difficulty,
      questions: row.questions,
    }));
  } catch (e) {
    console.warn('getSavedQuizzes exception:', e);
    return [];
  }
}

export async function saveQuizToLibrary(input: {
  title?: string;
  sourceType: 'notes' | 'flashcards';
  sourceId?: string;
  quizType?: QuizType;
  difficulty?: QuizDifficulty;
  questions: GeneratedQuizQuestion[];
}): Promise<SavedQuizItem> {
  const userId = await getCurrentUserId();
  const questions = (input.questions || []).slice(0, 50);

  const insertData = {
    user_id: userId,
    title: (input.title || 'Revision Quiz').trim() || 'Revision Quiz',
    question_count: questions.length,
    source_type: input.sourceType,
    source_id: input.sourceId || null,
    quiz_type: input.quizType || null,
    difficulty: input.difficulty || null,
    questions,
  };

  const { data, error } = await supabase
    .from('saved_quizzes')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error('Failed to save quiz to library: ' + error.message);
  }

  return {
    id: data.id,
    title: data.title,
    createdAt: data.created_at,
    questionCount: data.question_count,
    sourceType: data.source_type,
    sourceId: data.source_id,
    quizType: data.quiz_type as QuizType,
    difficulty: data.difficulty as QuizDifficulty,
    questions: data.questions,
  };
}

export async function deleteSavedQuiz(id: string): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    const { error } = await supabase
      .from('saved_quizzes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
      
    if (error) {
      console.error('Failed to delete saved quiz:', error);
      throw new Error(error.message);
    }
  } catch (e) {
    console.warn('deleteSavedQuiz exception:', e);
    throw e;
  }
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
