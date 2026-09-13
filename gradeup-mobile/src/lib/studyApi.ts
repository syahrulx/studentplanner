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
  type AiGenerateRequest,
  type AiGenerateQuizResult,
} from './invokeAiGenerate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeneratedFlashcard = {
  front: string;
  back: string;
  type?: 'basic' | 'cloze' | 'concept';
  hint?: string | null;
  source_excerpt?: string | null;
};

export type GenerateFlashcardsOutcome = {
  cards: GeneratedFlashcard[];
  warnings: string[];
  truncated: boolean;
  truncatedChars?: number;
};

export type QuizQuestionKind = 'mcq' | 'true_false' | 'short_answer';
export type QuizBloomLevel = 'remember' | 'understand' | 'apply' | 'analyze';

export type GeneratedQuizQuestion = {
  question: string;
  options: string[];
  /** Index into `options`; -1 for short-answer questions. */
  correctIndex: number;
  kind?: QuizQuestionKind;
  /** For short-answer questions: the expected answer text */
  expectedAnswer?: string | null;
  /** Alternative accepted answers (short answer). */
  acceptedAnswers?: string[] | null;
  /** 2-3 sentences: why the answer is right and why distractors are wrong. */
  explanation?: string | null;
  /** Brief reason/excerpt that supports why the answer is correct. */
  proof?: string | null;
  /** 0-based index into the `[Study source N]` blocks the client sent. */
  sourceIndex?: number | null;
  /** Resolved note id for `sourceIndex` (persisted into the session JSON). */
  sourceNoteId?: string | null;
  bloomLevel?: QuizBloomLevel | null;
  /**
   * Session-level timer marker. Only ever set on `questions[0]` when a session
   * is created (quiz_sessions has no timer column).
   */
  __timerSeconds?: number;
};

export type QuizGenerationQuality = {
  requested: number;
  generated: number;
  repaired: boolean;
  partial: boolean;
};

export type GenerateQuizResult = {
  questions: GeneratedQuizQuestion[];
  quality: QuizGenerationQuality;
  /** Parallel to the `[Study source N]` blocks sent to the server. */
  sourceNoteIds: string[];
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
  /** 0 = no timer. Stored inside `questions[0].__timerSeconds`. */
  timerSeconds?: number;
  questions: GeneratedQuizQuestion[];
};

export type QuizType = 'mcq' | 'true_false' | 'mixed' | 'short_answer';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export type QuizSourceNote = { id: string; content: string };

/**
 * Interleave note contents into `[Study source N]` blocks so a single large
 * note cannot consume the whole context window. Returns the combined text and
 * the note id for each block (block N ↔ sourceNoteIds[N - 1]).
 */
export function buildBalancedQuizSource(
  notes: QuizSourceNote[],
  maxChars = 14500,
): { content: string; sourceNoteIds: string[] } {
  const sources = notes
    .map((note) => ({
      id: String(note?.id ?? ''),
      content: String(note?.content ?? '').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim(),
    }))
    .filter((note) => note.content.length >= 20);
  if (sources.length === 0) return { content: '', sourceNoteIds: [] };

  // Round-robin chunks stop the first large PDF from consuming the complete
  // context window while later selected notes contribute nothing.
  const cursors = sources.map(() => 0);
  const pieces: string[] = [];
  let remaining = maxChars;
  let madeProgress = true;
  while (remaining > 80 && madeProgress) {
    madeProgress = false;
    for (let index = 0; index < sources.length && remaining > 80; index++) {
      const text = sources[index].content;
      if (cursors[index] >= text.length) continue;
      const label = `\n\n[Study source ${index + 1}]\n`;
      const take = Math.min(1400, text.length - cursors[index], remaining - label.length);
      if (take <= 0) continue;
      pieces.push(label, text.slice(cursors[index], cursors[index] + take));
      cursors[index] += take;
      remaining -= label.length + take;
      madeProgress = true;
    }
  }
  return {
    content: pieces.join('').slice(0, maxChars).trim(),
    sourceNoteIds: sources.map((note) => note.id),
  };
}

const QUESTION_KINDS: QuizQuestionKind[] = ['mcq', 'true_false', 'short_answer'];
const BLOOM_LEVELS: QuizBloomLevel[] = ['remember', 'understand', 'apply', 'analyze'];

function cleanText(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Light validator that trusts the server's curation. The Edge Function already
 * dedupes, balances question types / True-False answers and rotates MCQ answer
 * positions, so the client only drops structurally broken items and keeps the
 * server's ordering and answer positions untouched.
 */
export function validateGeneratedQuizQuestions(
  raw: unknown,
  requestedCount: number,
  serverQuality?: Partial<QuizGenerationQuality> | null,
  sourceNoteIds: string[] = [],
): { questions: GeneratedQuizQuestion[]; quality: QuizGenerationQuality } {
  const questions: GeneratedQuizQuestion[] = [];

  for (const candidate of Array.isArray(raw) ? (raw as any[]) : []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const question = cleanText(candidate.question, 500);
    if (!question) continue;

    const options = Array.isArray(candidate.options)
      ? candidate.options.map((option: unknown) => cleanText(option, 250)).filter((o: string) => o.length > 0)
      : [];
    const rawCorrect = Number(candidate.correctIndex);
    const expectedAnswer = cleanText(candidate.expectedAnswer, 250) || null;

    let kind: QuizQuestionKind;
    let correctIndex: number;
    if (options.length === 0) {
      // Short answer: needs an expected answer to be gradable.
      if (!expectedAnswer) continue;
      kind = 'short_answer';
      correctIndex = -1;
    } else {
      if (!Number.isInteger(rawCorrect) || rawCorrect < 0 || rawCorrect >= options.length) continue;
      correctIndex = rawCorrect;
      const declared = String(candidate.kind ?? '');
      kind = QUESTION_KINDS.includes(declared as QuizQuestionKind) && declared !== 'short_answer'
        ? (declared as QuizQuestionKind)
        : options.length === 2 && options.every((o: string) => /^(true|false)$/i.test(o))
          ? 'true_false'
          : 'mcq';
    }

    const acceptedAnswers = Array.isArray(candidate.acceptedAnswers)
      ? candidate.acceptedAnswers.map((a: unknown) => cleanText(a, 250)).filter(Boolean)
      : null;
    const sourceIndexRaw = Number(candidate.sourceIndex);
    const sourceIndex = Number.isInteger(sourceIndexRaw) && sourceIndexRaw >= 0 ? sourceIndexRaw : null;
    const sourceNoteId =
      cleanText(candidate.sourceNoteId, 120) ||
      (sourceIndex !== null && sourceIndex < sourceNoteIds.length ? sourceNoteIds[sourceIndex] : null) ||
      null;
    const bloomRaw = String(candidate.bloomLevel ?? '');
    const bloomLevel = BLOOM_LEVELS.includes(bloomRaw as QuizBloomLevel) ? (bloomRaw as QuizBloomLevel) : null;

    questions.push({
      question,
      options,
      correctIndex,
      kind,
      expectedAnswer: kind === 'short_answer' ? expectedAnswer : expectedAnswer || undefined,
      acceptedAnswers: acceptedAnswers && acceptedAnswers.length ? acceptedAnswers : null,
      explanation: cleanText(candidate.explanation, 1000) || null,
      proof: cleanText(candidate.proof, 300) || null,
      sourceIndex,
      sourceNoteId,
      bloomLevel,
    });
  }

  const requested = Math.max(
    1,
    Number(serverQuality?.requested) > 0 ? Number(serverQuality?.requested) : requestedCount,
  );
  const quality: QuizGenerationQuality = {
    requested,
    generated: questions.length,
    repaired: Boolean(serverQuality?.repaired),
    partial: Boolean(serverQuality?.partial) || questions.length < requested,
  };
  return { questions, quality };
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
  noteId?: string,
): Promise<GeneratedFlashcard[]> {
  const outcome = await generateFlashcardsFromNoteDetailed(noteContent, count, noteId);
  return outcome.cards;
}

/**
 * Same as generateFlashcardsFromNote but also returns server `warnings` and the
 * `truncated` flag so callers can tell the user when only part of the source
 * was used.
 */
export async function generateFlashcardsFromNoteDetailed(
  noteContent: string,
  count: number = 10,
  noteId?: string,
): Promise<GenerateFlashcardsOutcome> {
  if (!noteContent.trim()) return { cards: [], warnings: [], truncated: false };

  const { data, error } = await invokeGenerateFlashcards({
    source: 'text',
    content: noteContent,
    count,
    ...(noteId ? { note_id: noteId } : {}),
  });

  if (error) {
    throw new Error(error);
  }

  return {
    cards: (data?.cards ?? []).map((c) => ({
      front: String(c.front ?? ''),
      back: String(c.back ?? ''),
      type: c.type,
      hint: c.hint ?? null,
      source_excerpt: c.source_excerpt ?? null,
    })),
    warnings: Array.isArray(data?.warnings) ? data.warnings : [],
    truncated: !!data?.truncated,
    truncatedChars: typeof data?.truncated_chars === 'number' ? data.truncated_chars : undefined,
  };
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
// Quiz generation (via ai_generate Edge Function)
// ---------------------------------------------------------------------------

/**
 * Generate quiz questions from notes. Each note becomes a `[Study source N]`
 * block; the server reports `sourceIndex` per question which is resolved back
 * to `sourceNoteId` here.
 */
export async function generateQuizFromNotes(
  notes: QuizSourceNote[],
  questionCount: number,
  quizType: QuizType = 'mcq',
  difficulty: QuizDifficulty = 'medium',
  _userId?: string,
  language?: string,
): Promise<GenerateQuizResult> {
  const { content, sourceNoteIds } = buildBalancedQuizSource(notes);
  if (!content.trim()) {
    return {
      questions: [],
      quality: { requested: questionCount, generated: 0, repaired: false, partial: true },
      sourceNoteIds: [],
    };
  }

  // `source_note_ids` / `language` are part of the server contract for quiz
  // generation; typed here as an extension so the shared request type (owned
  // by the chat work) does not need to change.
  const body: AiGenerateRequest & { source_note_ids?: string[]; language?: string } = {
    kind: 'quiz',
    content,
    count: questionCount,
    quiz_type: quizType,
    difficulty,
    source_note_ids: sourceNoteIds,
  };
  if (language) body.language = language;

  const { data, error } = await invokeAiGenerate<AiGenerateQuizResult>(body);

  if (error) {
    // Do not turn a server failure into an empty quiz. That hid the actual
    // reason (for example a temporary AI-provider issue) behind a misleading
    // "try different notes" message.
    throw new Error(error);
  }

  const { questions, quality } = validateGeneratedQuizQuestions(
    data?.questions ?? [],
    questionCount,
    data?.quality,
    sourceNoteIds,
  );
  return { questions, quality, sourceNoteIds };
}

// ---------------------------------------------------------------------------
// Quiz AsyncStorage helpers
// ---------------------------------------------------------------------------

const QUIZ_TEMP_KEY = '@quiz_generated_store';

type GeneratedQuizStash = {
  questions: GeneratedQuizQuestion[];
  sourceNoteIds: string[];
};

async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  return session.user.id;
}

export async function setGeneratedQuizQuestions(
  questions: GeneratedQuizQuestion[],
  sourceNoteIds: string[] = [],
): Promise<void> {
  try {
    const stash: GeneratedQuizStash = { questions, sourceNoteIds };
    await AsyncStorage.setItem(QUIZ_TEMP_KEY, JSON.stringify(stash));
  } catch (e) {
    console.warn('Failed to save quiz to AsyncStorage', e);
  }
}

/** Returns the stashed questions plus the source-note map (both may be empty). */
export async function getGeneratedQuizStash(): Promise<GeneratedQuizStash> {
  try {
    const data = await AsyncStorage.getItem(QUIZ_TEMP_KEY);
    if (!data) return { questions: [], sourceNoteIds: [] };
    const parsed = JSON.parse(data);
    // Backwards compatibility: older builds stored a bare question array.
    if (Array.isArray(parsed)) return { questions: parsed as GeneratedQuizQuestion[], sourceNoteIds: [] };
    return {
      questions: Array.isArray(parsed?.questions) ? (parsed.questions as GeneratedQuizQuestion[]) : [],
      sourceNoteIds: Array.isArray(parsed?.sourceNoteIds) ? parsed.sourceNoteIds.map(String) : [],
    };
  } catch {
    return { questions: [], sourceNoteIds: [] };
  }
}

export async function getGeneratedQuizQuestions(): Promise<GeneratedQuizQuestion[]> {
  return (await getGeneratedQuizStash()).questions;
}

export async function clearGeneratedQuizQuestions(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUIZ_TEMP_KEY);
  } catch {}
}

function readTimerSeconds(questions: unknown): number | undefined {
  const raw = Array.isArray(questions) ? (questions[0] as any)?.__timerSeconds : undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
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
      timerSeconds: readTimerSeconds(row.questions),
      questions: Array.isArray(row.questions) ? row.questions : [],
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
  /** 0 = no timer. Persisted in `questions[0].__timerSeconds` when not already present. */
  timerSeconds?: number;
  questions: GeneratedQuizQuestion[];
}): Promise<SavedQuizItem> {
  const userId = await getCurrentUserId();
  const questions = (input.questions || []).slice(0, 50).map((q) => ({ ...q }));
  if (
    questions.length > 0 &&
    readTimerSeconds(questions) === undefined &&
    typeof input.timerSeconds === 'number' &&
    Number.isFinite(input.timerSeconds) &&
    input.timerSeconds >= 0
  ) {
    questions[0].__timerSeconds = input.timerSeconds;
  }

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
    timerSeconds: readTimerSeconds(data.questions),
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
