/**
 * Study API – flashcards and quiz generation via OpenAI.
 */
import Constants from 'expo-constants';

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

/**
 * Generate flashcards from note content using OpenAI.
 */
export async function generateFlashcardsFromNote(noteContent: string): Promise<GeneratedFlashcard[]> {
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
    const content = data.choices?.[0]?.message?.content ?? '';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const cards = JSON.parse(cleaned) as GeneratedFlashcard[];
    return Array.isArray(cards) ? cards : [];
  } catch {
    return [];
  }
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
