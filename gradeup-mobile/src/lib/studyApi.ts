/**
 * Study API – flashcards and quiz generation.
 * Add your OpenAI API key via EXPO_PUBLIC_OPENAI_API_KEY in .env or app.config.js
 * and implement the functions below with OpenAI (or another provider).
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
};

/**
 * Generate flashcards from note content.
 * TODO: Replace with OpenAI (e.g. chat.completions with a prompt that returns JSON array of { front, back }).
 */
export async function generateFlashcardsFromNote(noteContent: string): Promise<GeneratedFlashcard[]> {
  const key = getOpenAIKey();
  if (!key) {
    return [];
  }
  try {
    // TODO: Call OpenAI API. Example shape:
    // const response = await fetch('https://api.openai.com/v1/chat/completions', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    //   body: JSON.stringify({
    //     model: 'gpt-4o-mini',
    //     messages: [{ role: 'user', content: `Generate 5-10 flashcards (JSON array of { "front": "question", "back": "answer" }) from:\n\n${noteContent}` }],
    //     response_format: { type: 'json_object' },
    //   }),
    // });
    // const data = await response.json();
    // return parsed cards from data.choices[0].message.content
    return [];
  } catch {
    return [];
  }
}

/**
 * Generate quiz questions from note contents.
 * TODO: Replace with OpenAI (e.g. chat.completions returning JSON array of { question, options[], correctIndex }).
 */
export async function generateQuizFromNotes(
  noteContents: string[],
  questionCount: number
): Promise<GeneratedQuizQuestion[]> {
  const key = getOpenAIKey();
  if (!key) {
    return [];
  }
  const combined = noteContents.join('\n\n---\n\n');
  if (!combined.trim()) return [];
  try {
    // TODO: Call OpenAI API. Example shape:
    // const response = await fetch('https://api.openai.com/v1/chat/completions', { ... });
    // Parse data.choices[0].message.content as GeneratedQuizQuestion[]
    return [];
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
