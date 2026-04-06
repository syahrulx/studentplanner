/**
 * Study API – flashcards and quiz generation via OpenAI.
 */
import Constants from 'expo-constants';
import { supabase } from './supabase';

/**
 * Generate flashcards directly from a local PDF file in ONE API call.
 * Uploads to OpenAI Files API → generates flashcards via Chat Completions → cleans up.
 * This is much faster than extract-then-generate since it's a single round-trip.
 */
export async function generateFlashcardsFromPdfFile(
  fileUri: string,
  fileName?: string,
  userId?: string,
  maxCards: number = 15,
): Promise<{ cards: GeneratedFlashcard[]; error?: string }> {
  const key = getOpenAIKey();
  if (!key) return { cards: [], error: 'Missing OpenAI API key.' };

  let fileId: string | null = null;

  try {
    // Step 1: Upload PDF to OpenAI
    const uploadFormData = new FormData();
    uploadFormData.append('purpose', 'assistants');
    uploadFormData.append('file', {
      uri: fileUri,
      name: fileName || 'document.pdf',
      type: 'application/pdf',
    } as any);

    const uploadCtrl = new AbortController();
    const uploadTimeout = setTimeout(() => uploadCtrl.abort(), 60000);
    const uploadRes = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      signal: uploadCtrl.signal,
      body: uploadFormData,
    });
    clearTimeout(uploadTimeout);

    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok || !uploadJson?.id) {
      return {
        cards: [],
        error: uploadJson?.error?.message ?? `Upload failed (${uploadRes.status}).`,
      };
    }
    fileId = uploadJson.id;

    // Step 2: Generate flashcards directly from the PDF in ONE call
    const chatCtrl = new AbortController();
    const chatTimeout = setTimeout(() => chatCtrl.abort(), 120000);
    const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: chatCtrl.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert study assistant. Read the uploaded PDF and generate exactly ${maxCards} high-quality flashcards.

Rules:
- Focus on key concepts, definitions, and exam-relevant content
- Avoid trivial or filler content
- Each flashcard should test one important concept
- Keep questions clear and concise
- Answers must be accurate and helpful

Return ONLY a JSON array:
[{"front":"question","back":"answer"}]

No markdown, no explanation, ONLY the JSON array.`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Generate ${maxCards} flashcards from this document.` },
              { type: 'file', file: { file_id: fileId } },
            ],
          },
        ],
        temperature: 0.6,
        max_tokens: 4000,
      }),
    });
    clearTimeout(chatTimeout);

    const chatJson = await chatRes.json();

    // Token logging
    try {
      if (userId) {
        const usage = chatJson?.usage;
        await supabase.from('ai_token_usage').insert({
          user_id: userId,
          kind: 'flashcards_pdf_direct',
          model: 'gpt-4o-mini',
          prompt_tokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
          completion_tokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
          total_tokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : null,
        });
      }
    } catch { /* ignore */ }

    if (!chatRes.ok) {
      return {
        cards: [],
        error: chatJson?.error?.message ?? `AI failed (${chatRes.status}).`,
      };
    }

    const content = (chatJson?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) return { cards: [], error: 'AI returned empty response.' };

    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as GeneratedFlashcard[];
    const cards = Array.isArray(parsed)
      ? parsed.filter((c) => c.front?.trim() && c.back?.trim()).slice(0, maxCards)
      : [];

    return { cards };

  } catch (error) {
    return {
      cards: [],
      error: error instanceof Error ? error.message : 'Failed to generate flashcards.',
    };
  } finally {
    // Clean up OpenAI file
    if (fileId) {
      fetch(`https://api.openai.com/v1/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${key}` },
      }).catch(() => {});
    }
  }
}

const getOpenAIKey = (): string => {
  return (Constants.expoConfig?.extra?.openaiApiKey as string) || '';
};

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

async function logAiTokenUsage(params: {
  userId?: string;
  kind: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}): Promise<void> {
  try {
    const user_id = params.userId;
    if (!user_id) return;
    const u = params.usage ?? null;
    const prompt_tokens = u?.prompt_tokens;
    const completion_tokens = u?.completion_tokens;
    const total_tokens = u?.total_tokens;

    // Best-effort: never break AI generation if logging fails.
    await supabase.from('ai_token_usage').insert({
      user_id,
      kind: params.kind,
      model: params.model,
      prompt_tokens: typeof prompt_tokens === 'number' ? prompt_tokens : null,
      completion_tokens: typeof completion_tokens === 'number' ? completion_tokens : null,
      total_tokens: typeof total_tokens === 'number' ? total_tokens : null,
    });
  } catch {
    // ignore
  }
}

/**
 * Generate flashcards from note content using OpenAI.
 */
export async function generateFlashcardsFromNote(noteContent: string, userId?: string): Promise<GeneratedFlashcard[]> {
  const key = getOpenAIKey();
  if (!key) return [];
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a flashcard generator. Return ONLY a JSON array of objects with "front" and "back" keys. No markdown, no explanation.',
          },
          {
            role: 'user',
            content: `Generate 5-10 flashcards from the following content:\n\n${noteContent}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });
    const data = await response.json();
    await logAiTokenUsage({
      userId,
      kind: 'flashcards',
      model: 'gpt-4o-mini',
      usage: data?.usage,
    });
    const content = data.choices?.[0]?.message?.content ?? '';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const cards = JSON.parse(cleaned) as GeneratedFlashcard[];
    return Array.isArray(cards) ? cards : [];
  } catch {
    return [];
  }
}

/* ─── PDF Flashcard Generation (chunked) ──────────────────────────── */

const PDF_FLASHCARD_LIMIT = 15;
const CHUNK_SIZE = 2000;

const PDF_FLASHCARD_SYSTEM_PROMPT = `You are an expert study assistant.

Analyze the notes and generate high-quality flashcards.

Rules:
- Focus on key concepts, definitions, and exam-relevant content
- Avoid trivial sentences or filler
- Avoid duplicate questions
- Keep questions clear and concise
- Answers must be accurate and helpful
- Each flashcard should test one concept

Return ONLY a JSON array in this format:
[
  {
    "front": "question or term",
    "back": "answer or definition"
  }
]

No markdown, no explanation, no extra text. ONLY the JSON array.`;

function chunkText(text: string, size: number = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    // Try to break on a sentence boundary
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

async function generateCardsFromChunk(chunk: string, userId?: string): Promise<GeneratedFlashcard[]> {
  const key = getOpenAIKey();
  if (!key) return [];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: PDF_FLASHCARD_SYSTEM_PROMPT },
          { role: 'user', content: `Generate flashcards from the following notes:\n\n${chunk}` },
        ],
        temperature: 0.6,
        max_tokens: 3000,
      }),
    });
    const data = await response.json();
    await logAiTokenUsage({
      userId,
      kind: 'flashcards_pdf',
      model: 'gpt-4o-mini',
      usage: data?.usage,
    });
    const content = data.choices?.[0]?.message?.content ?? '';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const cards = JSON.parse(cleaned) as GeneratedFlashcard[];
    return Array.isArray(cards) ? cards : [];
  } catch {
    return [];
  }
}

/**
 * Generate flashcards from extracted PDF text.
 * Chunks the text, generates cards per chunk, deduplicates, caps at limit.
 * Retries once on empty result.
 */
export async function generateFlashcardsFromPdf(
  extractedText: string,
  userId?: string,
  maxCards: number = PDF_FLASHCARD_LIMIT,
): Promise<GeneratedFlashcard[]> {
  if (!extractedText.trim()) return [];

  const chunks = chunkText(extractedText, CHUNK_SIZE);
  if (chunks.length === 0) return [];

  // Generate from all chunks in parallel (max 5 at a time to be safe)
  const batchSize = 5;
  let allCards: GeneratedFlashcard[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((chunk) => generateCardsFromChunk(chunk, userId))
    );
    for (const cards of results) {
      allCards = allCards.concat(cards);
    }
    // Early exit if we have enough
    if (allCards.length >= maxCards * 2) break;
  }

  // Deduplicate and limit
  allCards = deduplicateCards(allCards);
  allCards = allCards.slice(0, maxCards);

  // Retry once if we got nothing (API might have glitched)
  if (allCards.length === 0 && chunks.length > 0) {
    const retryCards = await generateCardsFromChunk(
      chunks.slice(0, 3).join('\n\n'),
      userId,
    );
    allCards = deduplicateCards(retryCards).slice(0, maxCards);
  }

  return allCards;
}

function buildQuizPrompt(quizType: QuizType, difficulty: QuizDifficulty, questionCount: number): string {
  const typeInstr: Record<QuizType, string> = {
    mcq: 'Multiple choice questions with exactly 4 options. Set "correctIndex" to the 0-based index of the correct option.',
    true_false: 'True/False questions. Options must be exactly ["True", "False"]. Set "correctIndex" to 0 for True, 1 for False.',
    short_answer: 'Short answer questions. Set "options" to an empty array []. Set "correctIndex" to -1. Include "expectedAnswer" with the correct answer text.',
    mixed: 'A mix of MCQ (4 options), True/False (2 options: ["True","False"]), and Short Answer (empty options, include "expectedAnswer"). Vary the types.',
  };

  const diffInstr: Record<QuizDifficulty, string> = {
    easy: 'Basic recall and definition questions.',
    medium: 'Application and understanding questions requiring some reasoning.',
    hard: 'Analysis and synthesis questions that require deep understanding.',
  };

  return `You are a quiz question generator. Generate exactly ${questionCount} questions.

Rules:
- ${typeInstr[quizType]}
- Difficulty: ${diffInstr[difficulty]}
- Focus ONLY on the educational/academic subject matter. Ignore any PDF formatting artifacts, structural markup, file metadata, or encoding noise that may appear in the text.
- Questions must test the student's knowledge of the actual topics and concepts in the study material.
- Return ONLY a JSON array. No markdown, no explanation.
- Each object must have: "question" (string), "options" (string[]), "correctIndex" (number)${quizType === 'short_answer' || quizType === 'mixed' ? ', and optionally "expectedAnswer" (string)' : ''}.`;
}

/**
 * Generate quiz questions from note contents using OpenAI.
 */
export async function generateQuizFromNotes(
  noteContents: string[],
  questionCount: number,
  quizType: QuizType = 'mcq',
  difficulty: QuizDifficulty = 'medium',
  userId?: string,
): Promise<GeneratedQuizQuestion[]> {
  const key = getOpenAIKey();
  if (!key) return [];
  const combined = noteContents.join('\n\n---\n\n');
  if (!combined.trim()) return [];
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: buildQuizPrompt(quizType, difficulty, questionCount) },
          { role: 'user', content: `Generate quiz questions from the following study material:\n\n${combined}` },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });
    const data = await response.json();
    await logAiTokenUsage({
      userId,
      kind: 'quiz',
      model: 'gpt-4o-mini',
      usage: data?.usage,
    });
    const content = data.choices?.[0]?.message?.content ?? '';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const questions = JSON.parse(cleaned) as GeneratedQuizQuestion[];
    return Array.isArray(questions) ? questions.slice(0, questionCount) : [];
  } catch {
    return [];
  }
}

/** In-memory store for AI-generated quiz questions (used when navigating from AI Quiz Builder to gameplay). */
let generatedQuizQuestionsStore: GeneratedQuizQuestion[] = [];

export function setGeneratedQuizQuestions(questions: GeneratedQuizQuestion[]): void {
  generatedQuizQuestionsStore = questions;
}

export function getGeneratedQuizQuestions(): GeneratedQuizQuestion[] {
  return generatedQuizQuestionsStore;
}

export { getOpenAIKey };
