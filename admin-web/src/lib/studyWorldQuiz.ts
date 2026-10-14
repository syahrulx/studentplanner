import { supabase } from './supabase';

/**
 * Study World quiz question bank (O = true, X = false). Admins read and edit
 * study_world_quiz_questions directly (RLS: is_admin()); players never see it.
 * Per-question totals come from admin_study_world_quiz_stats().
 *
 * Website migration 202610120004_study_world_garden_quiz.sql (table + seed)
 * and gradeup-mobile migration 20261012000005_study_world_quiz_admin.sql (stats).
 *
 * Careful: deleting a question also deletes every round that asked it and the
 * players' answers (foreign key ON DELETE CASCADE). The admin page only allows
 * deleting questions that were never asked; others can be hidden instead.
 */

export type QuizStatus = 'active' | 'hidden';

export type QuizQuestion = {
  id: string;
  subject: string;
  question: string;
  answer: boolean;
  explanation: string | null;
  status: QuizStatus;
  created_at: string;
  updated_at: string;
};

export type QuizStats = { question_id: string; times_asked: number; answers: number; correct: number; last_asked: string | null };

export type QuizInput = Pick<QuizQuestion, 'subject' | 'question' | 'answer' | 'explanation' | 'status'>;

function explain(error: { code?: string; message?: string } | null): Error | null {
  if (!error) return null;
  const msg = error.message ?? 'Request failed';
  if (error.code === '23505' || /duplicate key/i.test(msg)) return new Error('That exact question is already in the bank.');
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(msg)) {
    return new Error('The quiz question bank is not in the database yet. Run the website migration 202610120004_study_world_garden_quiz.sql in the Supabase SQL Editor.');
  }
  return new Error(msg);
}

export async function listQuizQuestions(): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from('study_world_quiz_questions')
    .select('id,subject,question,answer,explanation,status,created_at,updated_at')
    .order('subject')
    .order('created_at');
  const err = explain(error);
  if (err) throw err;
  return (data ?? []) as QuizQuestion[];
}

/** Totals per question. Empty (not an error) if the stats SQL isn't run yet. */
export async function listQuizStats(): Promise<Record<string, QuizStats> | null> {
  const { data, error } = await supabase.rpc('admin_study_world_quiz_stats');
  if (error) return null;
  return Object.fromEntries(((data ?? []) as QuizStats[]).map((s) => [s.question_id, s]));
}

export async function saveQuizQuestion(id: string | null, input: QuizInput): Promise<void> {
  const row = {
    subject: input.subject.trim(),
    question: input.question.trim(),
    answer: input.answer,
    explanation: input.explanation?.trim() || null,
    status: input.status,
  };
  const { error } = id
    ? await supabase.from('study_world_quiz_questions').update(row).eq('id', id)
    : await supabase.from('study_world_quiz_questions').insert(row);
  const err = explain(error);
  if (err) throw err;
}

export async function setQuizStatus(ids: string[], status: QuizStatus): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase.from('study_world_quiz_questions').update({ status }).in('id', ids).select('id');
  const err = explain(error);
  if (err) throw err;
  return data?.length ?? 0;
}

export async function deleteQuizQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('study_world_quiz_questions').delete().eq('id', id);
  const err = explain(error);
  if (err) throw err;
}
