/**
 * Study API – flashcards and quiz generation via Edge Function (ai_generate).
 *
 * SECURITY: All AI calls now go through a Supabase Edge Function so the OpenAI
 * API key never appears in the client bundle. The Edge Function also enforces
 * per-user daily rate limits.
 */
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getNoteAttachmentUrl } from './noteStorage';
import {
  invokeAiGenerate,
  type AiGenerateFlashcardsResult,
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
// Flashcard generation (via Edge Function)
// ---------------------------------------------------------------------------

/**
 * Generate flashcards from note content.
 * Now proxied through the ai_generate Edge Function.
 */
export async function generateFlashcardsFromNote(
  noteContent: string,
  _userId?: string,
  count: number = 10,
): Promise<GeneratedFlashcard[]> {
  if (!noteContent.trim()) return [];

  const { data, error } = await invokeAiGenerate<AiGenerateFlashcardsResult>({
    kind: 'flashcards',
    content: noteContent,
    count,
  });

  if (error) {
    if (error.includes('timed out') || error.includes('RATE_LIMIT')) {
      throw new Error(error);
    }
    return [];
  }

  return data?.cards ?? [];
}

// ---------------------------------------------------------------------------
// PDF Flashcard Generation
// ---------------------------------------------------------------------------

const PDF_FLASHCARD_LIMIT = 15;
const CHUNK_SIZE = 4000;

function chunkText(text: string, size: number = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > i + size * 0.5) {
        end = breakPoint + 1;
      }
    }
    chunks.push(text.slice(i, end).trim());
    i = end;
  }
  return chunks.filter((c) => c.length > 20);
}

function deduplicateCards(cards: GeneratedFlashcard[]): GeneratedFlashcard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = (card.front ?? '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function generateCardsFromChunk(chunk: string): Promise<GeneratedFlashcard[]> {
  try {
    const { data, error } = await invokeAiGenerate<AiGenerateFlashcardsResult>({
      kind: 'flashcards_pdf',
      content: chunk,
      count: 10,
    });

    if (error || !data?.cards) return [];
    return data.cards;
  } catch {
    return [];
  }
}

/**
 * Generate flashcards from extracted PDF text.
 * Chunks the text, generates cards per chunk via Edge Function,
 * deduplicates, caps at limit. Retries once on empty result.
 */
export async function generateFlashcardsFromPdf(
  extractedText: string,
  _userId?: string,
  maxCards: number = PDF_FLASHCARD_LIMIT,
): Promise<GeneratedFlashcard[]> {
  if (!extractedText.trim()) return [];

  const chunks = chunkText(extractedText, CHUNK_SIZE);
  if (chunks.length === 0) return [];

  // Generate from all chunks in parallel
  const results = await Promise.all(
    chunks.map((chunk) => generateCardsFromChunk(chunk))
  );
  let allCards: GeneratedFlashcard[] = [];
  for (const cards of results) {
    allCards = allCards.concat(cards);
  }

  // Deduplicate and limit
  allCards = deduplicateCards(allCards);
  allCards = allCards.slice(0, maxCards);

  // Retry once if we got nothing
  if (allCards.length === 0 && chunks.length > 0) {
    const retryCards = await generateCardsFromChunk(
      chunks.slice(0, 3).join('\n\n'),
    );
    allCards = deduplicateCards(retryCards).slice(0, maxCards);
  }

  return allCards;
}

/**
 * Generate flashcards directly from a local PDF file.
 * Uploads to OpenAI Files API → generates flashcards via Edge Function.
 *
 * NOTE: For the direct PDF upload path we still call the Edge Function
 * with the extracted text content. The PDF-native OpenAI upload path
 * is only used in the SOW Extract Edge Function (server-side).
 */
export async function generateFlashcardsFromPdfFile(
  fileUri: string,
  fileName?: string,
  userId?: string,
  maxCards: number = 15,
): Promise<{ cards: GeneratedFlashcard[]; error?: string }> {
  try {
    // Use the pdfText extraction to get text, then call Edge Function
    const { extractPdfTextFromLocalUri } = await import('./pdfText');
    const result = await extractPdfTextFromLocalUri(fileUri, fileName, userId);
    if (!result.text.trim()) {
      return { cards: [], error: result.detail || 'Could not extract text from PDF.' };
    }

    const cards = await generateFlashcardsFromPdf(result.text, userId, maxCards);
    return { cards };
  } catch (error) {
    return {
      cards: [],
      error: error instanceof Error ? error.message : 'Failed to generate flashcards.',
    };
  }
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

/**
 * Download a note's PDF from Supabase Storage to a temp file, then run the same
 * Edge Function flashcard flow as {@link generateFlashcardsFromPdfFile}.
 */
export async function generateFlashcardsFromNotePdfStorage(
  storagePath: string,
  fileName: string | undefined,
  userId: string | undefined,
  maxCards: number = 18,
): Promise<{ cards: GeneratedFlashcard[]; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cacheDir = (FileSystem as any).cacheDirectory as string | null;
  if (!cacheDir) {
    return { cards: [], error: 'No local cache directory for PDF download.' };
  }
  const tempPath = `${cacheDir}fc_pdf_${Date.now()}.pdf`;
  try {
    const { url, error: urlErr } = await getNoteAttachmentUrl(storagePath);
    if (urlErr || !url) {
      return { cards: [], error: urlErr?.message ?? 'Could not access the PDF.' };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadResult = await (FileSystem as any).downloadAsync(url, tempPath) as { status: number };
    if (downloadResult.status !== 200) {
      return { cards: [], error: `Could not download PDF (HTTP ${downloadResult.status}).` };
    }
    return await generateFlashcardsFromPdfFile(tempPath, fileName, userId, maxCards);
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (FileSystem as any).deleteAsync?.(tempPath, { idempotent: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Quiz generation (via Edge Function)
// ---------------------------------------------------------------------------

/**
 * Generate quiz questions from note contents.
 * Now proxied through the ai_generate Edge Function.
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
 * AI generation now uses the ai_generate Edge Function.
 * This function returns true to indicate "AI is available" since
 * the key is now stored server-side.
 */
export function getOpenAIKey(): string {
  // Return a truthy string so existing `if (!getOpenAIKey())` checks pass.
  // The actual key is only on the Edge Function server.
  return 'edge-function';
}
