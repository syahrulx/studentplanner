/**
 * Quiz attempts – per-question history used for the wrong-answer bank,
 * "turn missed questions into flashcards", and per-note mastery.
 *
 * Backed by `public.quiz_attempts` and the `public.quiz_note_mastery` view
 * (migration 20260906000001). RLS: users can insert/select/delete own rows.
 */
import { supabase } from './supabase';

export type QuizAttemptRow = {
  user_id: string;
  session_id: string | null;
  question_index: number;
  question: string;
  options: string[];
  correct_index: number;
  expected_answer: string | null;
  explanation: string | null;
  selected_index: number | null;
  typed_answer: string | null;
  correct: boolean;
  time_ms: number | null;
  source_type: 'notes' | 'flashcards' | string | null;
  source_id: string | null;
  source_note_id: string | null;
  difficulty: string | null;
};

export type QuizAttempt = QuizAttemptRow & {
  id: string;
  created_at: string;
};

export type NoteMastery = {
  user_id: string;
  source_note_id: string;
  attempts: number;
  correct_count: number;
  accuracy_pct: number;
  last_attempt_at: string;
};

const INSERT_CHUNK = 100;

/**
 * Batch-insert attempt rows. Call ONCE at quiz finish with every graded
 * question. Failures are surfaced to the caller (they should be logged, not
 * shown as a blocking error – the score is already saved by the RPC).
 */
export async function recordQuizAttempts(rows: QuizAttemptRow[]): Promise<void> {
  if (!rows.length) return;
  const cleaned = rows.map((row) => ({
    ...row,
    question: String(row.question ?? '').slice(0, 500),
    options: Array.isArray(row.options) ? row.options.map((o) => String(o ?? '').slice(0, 250)) : [],
    expected_answer: row.expected_answer ? String(row.expected_answer).slice(0, 250) : null,
    explanation: row.explanation ? String(row.explanation).slice(0, 1000) : null,
    typed_answer: row.typed_answer ? String(row.typed_answer).slice(0, 250) : null,
    time_ms: row.time_ms == null ? null : Math.max(0, Math.round(row.time_ms)),
  }));

  for (let i = 0; i < cleaned.length; i += INSERT_CHUNK) {
    const { error } = await supabase.from('quiz_attempts').insert(cleaned.slice(i, i + INSERT_CHUNK));
    if (error) throw new Error(error.message || 'Failed to record quiz attempts');
  }
}

export async function getWrongAnswers(
  userId: string,
  opts: { limit?: number; sinceDays?: number; sourceNoteId?: string } = {},
): Promise<QuizAttempt[]> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 50));
  let query = supabase
    .from('quiz_attempts')
    .select('*')
    .eq('user_id', userId)
    .eq('correct', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.sinceDays && opts.sinceDays > 0) {
    const since = new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString();
    query = query.gte('created_at', since);
  }
  if (opts.sourceNoteId) {
    query = query.eq('source_note_id', opts.sourceNoteId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to load wrong answers');
  return (data || []) as QuizAttempt[];
}

export async function getNoteMastery(userId: string): Promise<NoteMastery[]> {
  const { data, error } = await supabase
    .from('quiz_note_mastery')
    .select('*')
    .eq('user_id', userId)
    .order('last_attempt_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load note mastery');
  return (data || []) as NoteMastery[];
}
