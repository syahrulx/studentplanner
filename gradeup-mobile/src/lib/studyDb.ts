/**
 * Supabase persistence for notes, flashcard_folders, and flashcards.
 * Run supabase-study-schema.sql in Supabase SQL Editor to create tables and RLS.
 */
import { supabase } from './supabase';
import type { Note, FlashcardFolder, Flashcard } from '../types';

const NOTES_TABLE = 'notes';
const FOLDERS_TABLE = 'flashcard_folders';
const CARDS_TABLE = 'flashcards';

function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    title: String(row.title),
    content: String(row.content ?? ''),
    tag: (row.tag as Note['tag']) || 'Lecture',
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    attachmentPath: row.attachment_path != null ? String(row.attachment_path) : undefined,
    attachmentFileName: row.attachment_file_name != null ? String(row.attachment_file_name) : undefined,
  };
}

function rowToFolder(row: Record<string, unknown>): FlashcardFolder {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at ?? ''),
  };
}

function rowToCard(row: Record<string, unknown>): Flashcard {
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
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

export async function getFlashcardFolders(userId: string): Promise<FlashcardFolder[]> {
  const { data, error } = await supabase
    .from(FOLDERS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(rowToFolder);
}

export async function getFlashcards(userId: string): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from(CARDS_TABLE)
    .select('*')
    .eq('user_id', userId);
  if (error) return [];
  return (data ?? []).map(rowToCard);
}

export async function upsertNote(userId: string, note: Note): Promise<void> {
  await supabase.from(NOTES_TABLE).upsert(
    {
      id: note.id,
      user_id: userId,
      subject_id: note.subjectId,
      title: note.title,
      content: note.content,
      tag: note.tag,
      updated_at: note.updatedAt ? new Date(note.updatedAt).toISOString() : new Date().toISOString(),
      attachment_path: note.attachmentPath ?? null,
      attachment_file_name: note.attachmentFileName ?? null,
    },
    { onConflict: 'id,user_id' }
  );
}

export async function upsertFlashcardFolder(userId: string, folder: FlashcardFolder): Promise<void> {
  await supabase.from(FOLDERS_TABLE).upsert(
    {
      id: folder.id,
      user_id: userId,
      name: folder.name,
      created_at: folder.createdAt,
    },
    { onConflict: 'id,user_id' }
  );
}

export async function upsertFlashcard(userId: string, card: Flashcard): Promise<void> {
  await supabase.from(CARDS_TABLE).upsert(
    {
      id: card.id,
      user_id: userId,
      folder_id: card.folderId ?? '',
      front: card.front,
      back: card.back,
    },
    { onConflict: 'id,user_id' }
  );
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  await supabase.from(NOTES_TABLE).delete().eq('user_id', userId).eq('id', noteId);
}

export async function deleteFlashcardFolder(userId: string, folderId: string): Promise<void> {
  await supabase.from(FOLDERS_TABLE).delete().eq('user_id', userId).eq('id', folderId);
  await supabase.from(CARDS_TABLE).delete().eq('user_id', userId).eq('folder_id', folderId);
}

export async function deleteFlashcard(userId: string, cardId: string): Promise<void> {
  await supabase.from(CARDS_TABLE).delete().eq('user_id', userId).eq('id', cardId);
}
