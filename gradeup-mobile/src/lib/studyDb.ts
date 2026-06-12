/**
 * Supabase persistence for notes, flashcard_folders, and flashcards.
 * Run supabase-study-schema.sql in Supabase SQL Editor to create tables and RLS.
 */
import { supabase } from './supabase';
import type { Note, Flashcard } from '../types';

const NOTES_TABLE = 'notes';
const CARDS_TABLE = 'flashcards';

function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    folderId: row.folder_id != null ? String(row.folder_id) : undefined,
    title: String(row.title),
    content: String(row.content ?? ''),
    tag: (row.tag as Note['tag']) || 'Lecture',
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    attachmentPath: row.attachment_path != null ? String(row.attachment_path) : undefined,
    attachmentFileName: row.attachment_file_name != null ? String(row.attachment_file_name) : undefined,
    extractedText: row.extracted_text != null ? String(row.extracted_text) : undefined,
    extractionError: row.extraction_error != null ? String(row.extraction_error) : undefined,
  };
}

function rowToCard(row: Record<string, unknown>): Flashcard {
  return {
    id: String(row.id),
    noteId: row.note_id ? String(row.note_id) : undefined,
    front: String(row.front),
    back: String(row.back),
  };
}

export async function getNotes(userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(rowToNote);
}



export async function getFlashcards(userId: string): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from(CARDS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: false }); // Fix 6: deterministic order (newest first)
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
  const { error } = await supabase.from(NOTES_TABLE).upsert(
    {
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
    },
    { onConflict: 'id,user_id' }
  );
  if (error) {
    // Notes historically failed silently because of a missing column — surface
    // the real reason so we never lose user writes without noticing again.
    if (__DEV__) console.error('[Note] upsert failed:', error);
    throw error;
  }
}



export async function upsertFlashcard(userId: string, card: Flashcard): Promise<void> {
  const { error } = await supabase.from(CARDS_TABLE).upsert(
    {
      id: card.id,
      user_id: userId,
      note_id: card.noteId ?? null,
      front: card.front,
      back: card.back,
    },
    { onConflict: 'id,user_id' }
  );
  if (error) {
    if (__DEV__) console.error('[Flashcard] upsert failed:', error);
    throw error;
  }
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const { error } = await supabase.from(NOTES_TABLE).delete().eq('user_id', userId).eq('id', noteId);
  if (error) {
    if (__DEV__) console.error('[Note] delete failed:', error);
    throw error;
  }
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
