/**
 * Supabase persistence for notes, flashcard_folders, and flashcards.
 * Run supabase-study-schema.sql in Supabase SQL Editor to create tables and RLS.
 */
import { supabase } from './supabase';
import type { Note, Flashcard } from '../types';
import type { ReviewLogRow } from './fsrs';
import { isHandwritingNoteContent } from './handwritingTypes';

const NOTES_TABLE = 'notes';
const CARDS_TABLE = 'flashcards';
const REVIEWS_TABLE = 'flashcard_reviews';

function rowToNote(row: Record<string, unknown>): Note {
  const content = String(row.content ?? '');
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    noteType: row.note_type === 'handwriting' || isHandwritingNoteContent(content) ? 'handwriting' : 'text',
    folderId: row.folder_id != null ? String(row.folder_id) : undefined,
    title: String(row.title),
    content,
    tag: (row.tag as Note['tag']) || 'Lecture',
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    attachmentPath: row.attachment_path != null ? String(row.attachment_path) : undefined,
    attachmentFileName: row.attachment_file_name != null ? String(row.attachment_file_name) : undefined,
    extractedText: row.extracted_text != null ? String(row.extracted_text) : undefined,
    extractionError: row.extraction_error != null ? String(row.extraction_error) : undefined,
  };
}

function numOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isoOrUndefined(value: unknown): string | undefined {
  if (value == null) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function rowToCard(row: Record<string, unknown>): Flashcard {
  const cardType = row.card_type;
  const state = numOr(row.state, 0);
  return {
    id: String(row.id),
    noteId: row.note_id ? String(row.note_id) : undefined,
    front: String(row.front),
    back: String(row.back),
    cardType: cardType === 'cloze' || cardType === 'concept' ? cardType : 'basic',
    hint: row.hint != null && String(row.hint).trim() ? String(row.hint) : undefined,
    sourceExcerpt:
      row.source_excerpt != null && String(row.source_excerpt).trim() ? String(row.source_excerpt) : undefined,
    position: numOr(row.position, 0),
    createdAt: isoOrUndefined(row.created_at),
    updatedAt: isoOrUndefined(row.updated_at),
    due: isoOrUndefined(row.due),
    stability: numOr(row.stability, 0),
    difficulty: numOr(row.difficulty, 0),
    elapsedDays: numOr(row.elapsed_days, 0),
    scheduledDays: numOr(row.scheduled_days, 0),
    learningSteps: numOr(row.learning_steps, 0),
    reps: numOr(row.reps, 0),
    lapses: numOr(row.lapses, 0),
    state: state === 1 || state === 2 || state === 3 ? state : 0,
    lastReview: isoOrUndefined(row.last_review) ?? null,
  };
}

/** Flashcard -> `public.flashcards` row. `updated_at` is always bumped to now. */
function cardToRow(userId: string, card: Flashcard, nowIso: string): Record<string, unknown> {
  const state = card.state ?? 0;
  return {
    id: card.id,
    user_id: userId,
    note_id: card.noteId ?? null,
    front: sanitizeText(card.front) ?? '',
    back: sanitizeText(card.back) ?? '',
    card_type: card.cardType ?? 'basic',
    hint: sanitizeText(card.hint),
    source_excerpt: sanitizeText(card.sourceExcerpt),
    position: card.position ?? 0,
    due: card.due ?? nowIso,
    stability: card.stability ?? 0,
    difficulty: card.difficulty ?? 0,
    elapsed_days: card.elapsedDays ?? 0,
    scheduled_days: card.scheduledDays ?? 0,
    learning_steps: card.learningSteps ?? 0,
    reps: card.reps ?? 0,
    lapses: card.lapses ?? 0,
    state: state === 1 || state === 2 || state === 3 ? state : 0,
    last_review: card.lastReview ?? null,
    updated_at: nowIso,
  };
}

export async function getNotes(userId: string): Promise<Note[]> {
  try {
    return await getNotesStrict(userId);
  } catch {
    return [];
  }
}

/** Same query as getNotes, but preserves network/RLS failures for offline-aware callers. */
export async function getNotesStrict(userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load notes');
  return (data ?? []).map(rowToNote);
}



export async function getFlashcards(userId: string): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from(CARDS_TABLE)
    .select('*')
    .eq('user_id', userId)
    // Deterministic order: newest first, id as a tiebreaker for equal timestamps.
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) return [];
  return (data ?? []).map(rowToCard);
}

/**
 * Strip null bytes (\u0000) from a string before writing to Postgres.
 * PostgreSQL's text type rejects the null character (error 22P05), which can
 * appear in PDF-extracted content or binary-mode OCR output.
 */
function sanitizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.replace(/\u0000/g, '');
}

export async function upsertNote(userId: string, note: Note): Promise<void> {
  const basePayload = {
    id: note.id,
    user_id: userId,
    subject_id: note.subjectId,
    folder_id: note.folderId ?? null,
    title: sanitizeText(note.title) ?? '',
    content: sanitizeText(note.content) ?? '',
    tag: note.tag,
    updated_at: note.updatedAt ? new Date(note.updatedAt).toISOString() : new Date().toISOString(),
    attachment_path: note.attachmentPath ?? null,
    attachment_file_name: note.attachmentFileName ?? null,
    extracted_text: sanitizeText(note.extractedText),
    extraction_error: sanitizeText(note.extractionError),
  };
  let { error } = await supabase.from(NOTES_TABLE).upsert(
    { ...basePayload, note_type: note.noteType ?? 'text' },
    { onConflict: 'id,user_id' },
  );

  // Keep existing typed/PDF note writes working during a staged rollout where
  // the mobile build reaches users before the additive handwriting migration.
  if (error && /note_type/i.test(error.message ?? '')) {
    const legacyResult = await supabase.from(NOTES_TABLE).upsert(basePayload, { onConflict: 'id,user_id' });
    error = legacyResult.error;
  }
  if (error) {
    // Notes historically failed silently because of a missing column — surface
    // the real reason so we never lose user writes without noticing again.
    if (__DEV__) console.error('[Note] upsert failed:', error);
    throw error;
  }
}



export async function upsertFlashcard(userId: string, card: Flashcard): Promise<void> {
  const { error } = await supabase
    .from(CARDS_TABLE)
    .upsert(cardToRow(userId, card, new Date().toISOString()), { onConflict: 'id,user_id' });
  if (error) {
    if (__DEV__) console.error('[Flashcard] upsert failed:', error);
    throw error;
  }
}

const UPSERT_CHUNK = 200;

/** Batch upsert (chunks of 200). Throws on the first failing chunk. */
export async function upsertFlashcards(userId: string, cards: Flashcard[]): Promise<void> {
  if (cards.length === 0) return;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < cards.length; i += UPSERT_CHUNK) {
    const rows = cards.slice(i, i + UPSERT_CHUNK).map((c) => cardToRow(userId, c, nowIso));
    const { error } = await supabase.from(CARDS_TABLE).upsert(rows, { onConflict: 'id,user_id' });
    if (error) {
      if (__DEV__) console.error('[Flashcard] batch upsert failed:', error);
      throw error;
    }
  }
}

/** One row per rating, holding the card state BEFORE the review. */
export async function insertFlashcardReview(userId: string, row: ReviewLogRow): Promise<void> {
  const { error } = await supabase.from(REVIEWS_TABLE).insert({ ...row, user_id: userId });
  if (error) {
    if (__DEV__) console.error('[Flashcard] review insert failed:', error);
    throw error;
  }
}

export interface RecentReviewStats {
  /** Number of reviews in the window. */
  count: number;
  /** Fraction of reviews rated Again (0..1); 0 when there are no reviews. */
  againRate: number;
  againCount: number;
}

/** Review activity over the last `days` days. */
export async function getRecentReviewStats(userId: string, days: number): Promise<RecentReviewStats> {
  const since = new Date(Date.now() - Math.max(1, days) * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .select('rating')
    .eq('user_id', userId)
    .gte('review_at', since);
  if (error) {
    if (__DEV__) console.error('[Flashcard] review stats failed:', error);
    throw error;
  }
  const rows = data ?? [];
  const againCount = rows.filter((r) => Number(r.rating) === 1).length;
  return {
    count: rows.length,
    againCount,
    againRate: rows.length > 0 ? againCount / rows.length : 0,
  };
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const { error } = await supabase.from(NOTES_TABLE).delete().eq('user_id', userId).eq('id', noteId);
  if (error) {
    if (__DEV__) console.error('[Note] delete failed:', error);
    throw error;
  }
}

/** Delete notes and their flashcards for exactly one subject owned by one user. */
export async function deleteSubjectStudyData(userId: string, subjectId: string): Promise<void> {
  const { data: noteRows, error: readError } = await supabase
    .from(NOTES_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('subject_id', subjectId);
  if (readError) throw readError;
  const noteIds = (noteRows ?? []).map((row) => String(row.id)).filter(Boolean);
  if (noteIds.length > 0) {
    const { error: cardsError } = await supabase
      .from(CARDS_TABLE)
      .delete()
      .eq('user_id', userId)
      .in('note_id', noteIds);
    if (cardsError) throw cardsError;
  }
  const { error: notesError } = await supabase
    .from(NOTES_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('subject_id', subjectId);
  if (notesError) throw notesError;
}



export async function deleteFlashcard(userId: string, cardId: string): Promise<void> {
  const { error } = await supabase.from(CARDS_TABLE).delete().eq('user_id', userId).eq('id', cardId);
  if (error) {
    if (__DEV__) console.error('[Flashcard] delete failed:', error);
    throw error;
  }
}

/** Delete all flashcards for a specific note in one DB call. */
export async function deleteFlashcardsForNote(userId: string, noteId: string): Promise<void> {
  const { error } = await supabase.from(CARDS_TABLE).delete().eq('user_id', userId).eq('note_id', noteId);
  if (error) {
    if (__DEV__) console.error('[Flashcard] deleteForNote failed:', error);
    throw error;
  }
}
