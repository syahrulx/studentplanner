/**
 * Central model registry for every AI-calling Edge Function.
 *
 * Model IDs verified against the official OpenAI models/pricing pages and the
 * Gemini models page on 2026-09-06:
 *   - gpt-5.6-luna   $0.20 / $1.20 per 1M tokens (cost tier, vision, structured outputs)
 *   - gpt-5.6-terra  $2.00 / $12.00 per 1M tokens (balanced tier)
 *   - gpt-5.6-sol    $4.00 / $20.00 per 1M tokens (flagship)
 *   - text-embedding-3-large  $0.13 per 1M tokens (newest embedding line)
 *   - gemini-3.8-flash        stable, fastest current Flash for document OCR
 *
 * gpt-4o / gpt-4o-mini / gpt-4.1 are listed as deprecated by OpenAI and must
 * not be reintroduced here.
 *
 * Every entry can be overridden with an env secret so a model swap never needs
 * an app release: `npx supabase secrets set OPENAI_MODEL_FAST=...`.
 */

function env(name: string, fallback: string): string {
  const v = (Deno.env.get(name) ?? '').trim();
  return v.length > 0 ? v : fallback;
}

/** Cheapest current-generation model. Extraction, flashcards, OCR, grading. */
export const OPENAI_MODEL_FAST = env('OPENAI_MODEL_FAST', 'gpt-5.6-luna');
/** Balanced tier. Pro-plan tutoring and Pro quiz generation. */
export const OPENAI_MODEL_BALANCED = env('OPENAI_MODEL_BALANCED', 'gpt-5.6-terra');
/** Flagship tier. Reserved for explicit opt-in (not used by default). */
export const OPENAI_MODEL_FLAGSHIP = env('OPENAI_MODEL_FLAGSHIP', 'gpt-5.6-sol');

/** Embedding model + dimensions. Dimensions are pinned to the pgvector column. */
export const OPENAI_EMBEDDING_MODEL = env('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-large');
export const OPENAI_EMBEDDING_DIMENSIONS = 1536;

/** Ordered Gemini preference list for PDF text extraction / OCR. */
export const GEMINI_PREFERRED_MODELS: string[] = [
  env('GEMINI_MODEL_PRIMARY', 'gemini-3.8-flash'),
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
];

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

/**
 * Pick the OpenAI model for a task given the caller's plan.
 * Vision no longer needs a separate model: every GPT-5.6 tier accepts images.
 */
export function pickOpenAiModel(
  task: 'chat' | 'quiz' | 'flashcards' | 'extract' | 'ocr' | 'grade',
  plan: string | null | undefined,
): string {
  const p = (plan ?? 'free').toLowerCase();
  if (p === 'pro' && (task === 'chat' || task === 'quiz')) return OPENAI_MODEL_BALANCED;
  return OPENAI_MODEL_FAST;
}

/**
 * GPT-5.x / GPT-6 models expose `reasoning_effort` and reject `temperature`
 * (except in narrow cases). Older chat models accept `temperature` only.
 * This helper returns the sampling block to spread into a Chat Completions
 * body so callers never special-case model families again.
 */
export function samplingParams(
  model: string,
  opts: { temperature?: number; reasoning?: ReasoningEffort } = {},
): Record<string, unknown> {
  const isReasoningFamily = /^(gpt-5|gpt-6|o[1-9]|chat-latest)/i.test(model);
  if (isReasoningFamily) {
    return { reasoning_effort: opts.reasoning ?? 'none' };
  }
  return opts.temperature != null ? { temperature: opts.temperature } : {};
}

/** Normalise OpenAI usage blocks (field names differ across model generations). */
export function normalizeUsage(raw: any): { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null {
  if (!raw) return null;
  const prompt = Number(raw.prompt_tokens ?? raw.input_tokens ?? 0);
  const completion = Number(raw.completion_tokens ?? raw.output_tokens ?? 0);
  const total = Number(raw.total_tokens ?? prompt + completion);
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
}
