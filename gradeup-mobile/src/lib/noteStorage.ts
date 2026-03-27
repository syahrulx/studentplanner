/**
 * Note attachments stored in Supabase Storage bucket "note-attachments".
 * Path pattern: {userId}/{noteId}/{filename}
 * Run supabase-storage-notes.sql in Supabase SQL Editor for RLS policies.
 * Create the bucket in Dashboard (Storage → New bucket → note-attachments, Private) or call ensureBucket once.
 */
import { supabase } from './supabase';

export const NOTE_ATTACHMENTS_BUCKET = 'note-attachments';

/**
 * Upload a file for a note from a local URI (e.g. from ImagePicker or DocumentPicker).
 * Uses expo-file-system to read the file as base64 (works in React Native),
 * then converts to ArrayBuffer via base64-arraybuffer for Supabase upload.
 * Path: {userId}/{noteId}/{fileName}
 * Returns the storage path to store in your note record.
 */
export async function uploadNoteAttachment(
  userId: string,
  noteId: string,
  fileUri: string,
  fileName: string,
  mimeType?: string
): Promise<{ path: string; error: Error | null }> {
  const path = `${userId}/${noteId}/${fileName}`;
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: mimeType ?? 'application/octet-stream',
    } as any);

    const { error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).upload(path, formData, {
      upsert: true,
    });
    return { path, error: error ?? null };
  } catch (e) {
    return { path: '', error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Upload from blob/ArrayBuffer (e.g. from a form or in-memory content).
 */
export async function uploadNoteAttachmentBlob(
  userId: string,
  noteId: string,
  blob: Blob | ArrayBuffer,
  fileName: string
): Promise<{ path: string; error: Error | null }> {
  const path = `${userId}/${noteId}/${fileName}`;
  const body = blob instanceof ArrayBuffer ? blob : blob;
  const { error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).upload(path, body, {
    contentType: blob instanceof Blob ? blob.type : 'application/octet-stream',
    upsert: true,
  });
  return { path, error: error ?? null };
}

/**
 * Get a signed URL to download/view a note attachment (private bucket). Expires in 1 hour.
 */
export async function getNoteAttachmentUrl(storagePath: string): Promise<{ url: string; error: Error | null }> {
  const { data, error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).createSignedUrl(storagePath, 3600);
  return { url: data?.signedUrl ?? '', error: error ?? null };
}

/**
 * Delete a note attachment by its storage path.
 */
export async function deleteNoteAttachment(storagePath: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).remove([storagePath]);
  return { error: error ?? null };
}

/**
 * List files for a note (folder: userId/noteId/).
 */
export async function listNoteAttachments(userId: string, noteId: string): Promise<{ paths: string[]; error: Error | null }> {
  const folder = `${userId}/${noteId}`;
  const { data, error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).list(folder);
  if (error) return { paths: [], error };
  const paths = (data?.map((o) => (o.name ? `${folder}/${o.name}` : '')) ?? []).filter(Boolean);
  return { paths, error: null };
}
