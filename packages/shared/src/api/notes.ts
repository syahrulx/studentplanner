import type { SupabaseClient } from '@supabase/supabase-js';
import type { Flashcard, Note } from '../types';

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
    updatedAt: row.updated_at
      ? new Date(String(row.updated_at)).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
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

function sanitizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.replace(/\u0000/g, '');
}

export async function getNotes(supabase: SupabaseClient, userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map((row) => rowToNote(row as Record<string, unknown>));
}

export async function getFlashcards(supabase: SupabaseClient, userId: string): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from(CARDS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: false });
  if (error) return [];
  return (data ?? []).map((row) => rowToCard(row as Record<string, unknown>));
}

export async function upsertNote(supabase: SupabaseClient, userId: string, note: Note): Promise<void> {
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
    { onConflict: 'id,user_id' },
  );
  if (error) throw error;
}

export async function deleteNote(supabase: SupabaseClient, userId: string, noteId: string): Promise<void> {
  const { error } = await supabase.from(NOTES_TABLE).delete().eq('user_id', userId).eq('id', noteId);
  if (error) throw error;
}

export function createNoteId(): string {
  return `n${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const NOTE_TAGS: Note['tag'][] = ['Lecture', 'Tutorial', 'Exam', 'Important', 'Lab', 'Discussion'];
