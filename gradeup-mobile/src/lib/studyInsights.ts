/**
 * Study insights — "what should I do right now?"
 *
 * One RPC (`get_study_insights`) backs the whole surface, so the Study tab
 * costs a single round trip. Aggregation happens in Postgres; the phone never
 * pulls raw review or attempt rows just to count them.
 */
import { supabase } from './supabase';
import type { GeneratedQuizQuestion } from './studyApi';

export type ReviewStats = {
  /** Ratings recorded in the window. */
  total: number;
  /** How many were "Forgot". */
  again: number;
  /** Share answered without forgetting, or null when nothing was reviewed. */
  retentionPct: number | null;
  daysActive: number;
  /** Consecutive days ending today or yesterday. */
  streak: number;
};

export type WeakNote = {
  noteId: string;
  title: string;
  subjectId: string | null;
  attempts: number;
  accuracyPct: number;
};

export type StudyInsights = {
  reviews: ReviewStats;
  weakNotes: WeakNote[];
  missedCount: number;
};

export const EMPTY_INSIGHTS: StudyInsights = {
  reviews: { total: 0, again: 0, retentionPct: null, daysActive: 0, streak: 0 },
  weakNotes: [],
  missedCount: 0,
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Never throws: this powers a passive dashboard section, and a failed insights
 * call must not break the Study tab. Callers get zeroed stats instead.
 */
export async function getStudyInsights(options?: {
  days?: number;
  weakLimit?: number;
}): Promise<StudyInsights> {
  try {
    const { data, error } = await supabase.rpc('get_study_insights', {
      p_days: options?.days ?? 30,
      p_weak_limit: options?.weakLimit ?? 5,
    });
    if (error || !data) {
      if (__DEV__ && error) console.error('[StudyInsights] rpc failed:', error.message);
      return EMPTY_INSIGHTS;
    }

    const raw = data as Record<string, any>;
    const reviews = raw.reviews ?? {};
    const weak = Array.isArray(raw.weak_notes) ? raw.weak_notes : [];

    return {
      reviews: {
        total: num(reviews.total),
        again: num(reviews.again),
        retentionPct: reviews.retention_pct == null ? null : num(reviews.retention_pct),
        daysActive: num(reviews.days_active),
        streak: num(reviews.streak),
      },
      weakNotes: weak
        .filter((w: any) => w && typeof w.note_id === 'string')
        .map((w: any) => ({
          noteId: String(w.note_id),
          title: String(w.title ?? 'Untitled note'),
          subjectId: w.subject_id ? String(w.subject_id) : null,
          attempts: num(w.attempts),
          accuracyPct: num(w.accuracy_pct),
        })),
      missedCount: num(raw.missed?.count),
    };
  } catch (e) {
    if (__DEV__) console.error('[StudyInsights] failed:', e);
    return EMPTY_INSIGHTS;
  }
}

/**
 * Build a practice quiz from questions the student most recently got wrong.
 *
 * Reuses the normal quiz pipeline: the caller stashes these and pushes
 * `/quiz-mode-selection?useGenerated=1`, so there is no separate gameplay path
 * to maintain. Returns `[]` when the bank is empty.
 *
 * `noteId` narrows the bank to one topic, which is what the weak-topic rows do.
 */
export async function buildMissedQuestionsQuiz(options?: {
  limit?: number;
  noteId?: string;
}): Promise<{ questions: GeneratedQuizQuestion[]; sourceNoteIds: string[] }> {
  const limit = Math.min(Math.max(1, options?.limit ?? 15), 30);
  try {
    let query = supabase
      .from('quiz_missed_bank')
      .select('question, options, correct_index, expected_answer, explanation, source_note_id, difficulty, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (options?.noteId) query = query.eq('source_note_id', options.noteId);

    const { data, error } = await query;
    if (error || !data?.length) {
      if (__DEV__ && error) console.error('[StudyInsights] missed bank failed:', error.message);
      return { questions: [], sourceNoteIds: [] };
    }

    const sourceNoteIds: string[] = [];
    const questions: GeneratedQuizQuestion[] = [];

    for (const row of data as any[]) {
      const question = String(row.question ?? '').trim();
      if (!question) continue;
      const options_ = Array.isArray(row.options) ? row.options.map((o: unknown) => String(o ?? '')) : [];
      const correctIndex = Number(row.correct_index);
      const expectedAnswer = row.expected_answer ? String(row.expected_answer) : undefined;

      // A stored attempt must still be answerable: either a valid option index
      // or an expected answer for the short-answer path.
      const isChoice = options_.length > 0 && Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options_.length;
      const isShort = options_.length === 0 && !!expectedAnswer;
      if (!isChoice && !isShort) continue;

      const noteId = row.source_note_id ? String(row.source_note_id) : null;
      let sourceIndex: number | null = null;
      if (noteId) {
        const existing = sourceNoteIds.indexOf(noteId);
        sourceIndex = existing >= 0 ? existing : sourceNoteIds.push(noteId) - 1;
      }

      questions.push({
        question,
        options: options_,
        correctIndex: isChoice ? correctIndex : -1,
        expectedAnswer,
        explanation: row.explanation ? String(row.explanation) : undefined,
        // The grounding line is not stored per attempt; the explanation carries
        // the teaching value, so reuse it rather than showing an empty field.
        proof: row.explanation ? String(row.explanation).slice(0, 160) : undefined,
        kind: isShort ? 'short_answer' : options_.length === 2 ? 'true_false' : 'mcq',
        sourceIndex,
        sourceNoteId: noteId ?? undefined,
      });
    }

    return { questions, sourceNoteIds };
  } catch (e) {
    if (__DEV__) console.error('[StudyInsights] buildMissedQuestionsQuiz failed:', e);
    return { questions: [], sourceNoteIds: [] };
  }
}
