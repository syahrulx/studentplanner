/**
 * Note attachments stored in Supabase Storage bucket "note-attachments".
 * Path pattern: {userId}/{noteId}/{filename}
 * Run supabase-storage-notes.sql in Supabase SQL Editor for RLS policies.
 * Create the bucket in Dashboard (Storage → New bucket → note-attachments, Private) or call ensureBucket once.
 */
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { readUriAsBase64 } from './readUriAsBase64';

export const NOTE_ATTACHMENTS_BUCKET = 'note-attachments';

/**
 * Upload a file for a note from a local URI (e.g. from ImagePicker or DocumentPicker).
 * Uses expo-file-system to read the file as base64 (works in React Native),
 * then converts to ArrayBuffer via base64-arraybuffer for Supabase upload.
 * Path: {userId}/{noteId}/{fileName}
 * Returns the storage path to store in your note record.
 */
/**
 * A filename safe to use as a Supabase Storage object key.
 *
 * The key used to be the student's filename verbatim. Storage rejects keys
 * holding anything outside a narrow set, which includes every accented or
 * non-Latin letter and — the common case — the curly apostrophe and en-dash
 * that Word and macOS insert on their own. So "Rubric – Group Assignment.pdf"
 * failed every single time, on any connection, and the app blamed the network.
 *
 * The student's original name is kept untouched as the note title and in
 * attachment_file_name; only the storage path is folded down to plain ASCII.
 */
export function safeStorageFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot + 1) : '';
  const fold = (v: string) =>
    v
      // Decompose accents so "é" becomes "e" rather than being dropped whole.
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      // Typographic quotes and dashes have plain equivalents; everything else
      // outside the safe set becomes a hyphen.
      .replace(/[\u2018\u2019\u201b]/g, "'")
      .replace(/[\u201c\u201d]/g, '')
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/[^A-Za-z0-9 ._-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.\s]+|[-.\s]+$/g, '')
      .trim();
  const safeStem = fold(stem).slice(0, 120) || 'file';
  const safeExt = fold(ext).toLowerCase().slice(0, 10);
  return safeExt ? `${safeStem}.${safeExt}` : safeStem;
}

/**
 * Send the file straight from disk, without it passing through JS memory.
 *
 * The base64 path below holds the whole file as a JavaScript string — two bytes
 * per character — and then copies it again into an ArrayBuffer, so a 20MB PDF
 * needs about 75MB at once and a 24MB one about 90MB. A phone under memory
 * pressure fails that read, and the only thing the student was ever told was to
 * check their connection, which could not have been less true: the file would
 * fail on any connection, every time, while a classmate's 2MB slides uploaded
 * fine. That is why it looked like one student's problem.
 *
 * uploadAsync streams the file from its own path, so size stops mattering.
 */
async function streamUpload(
  path: string,
  fileUri: string,
  mimeType: string,
): Promise<{ ok: boolean; error: Error | null }> {
  const base = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
  if (!base) return { ok: false, error: new Error('Missing Supabase URL') };
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: new Error('Not signed in') };

  const url = `${base}/storage/v1/object/${NOTE_ATTACHMENTS_BUCKET}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const res = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
      'x-upsert': 'true',
    },
  });
  if (res.status >= 200 && res.status < 300) return { ok: true, error: null };
  // Storage puts the real reason in the body; keep it, we have been guessing for
  // long enough.
  return { ok: false, error: new Error(`HTTP ${res.status}: ${(res.body ?? '').slice(0, 300)}`) };
}

export async function uploadNoteAttachment(
  userId: string,
  noteId: string,
  fileUri: string,
  fileName: string,
  mimeType?: string
): Promise<{ path: string; error: Error | null }> {
  const path = `${userId}/${noteId}/${safeStorageFileName(fileName)}`;
  const contentType = mimeType ?? 'application/octet-stream';
  try {
    if (Platform.OS !== 'web') {
      const streamed = await streamUpload(path, fileUri, contentType);
      if (streamed.ok) return { path, error: null };
      // Fall through to the in-memory path rather than failing outright: it
      // still works for the small files that were never the problem.
      console.warn('[noteStorage] stream upload failed, retrying in memory:', streamed.error?.message);
    }

    const base64 = await readUriAsBase64(fileUri);
    const arrayBuffer = decode(base64);
    const { error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).upload(path, arrayBuffer, {
      contentType,
      upsert: true,
    });

    return { path, error: error ?? null };
  } catch (e) {
    console.error('[noteStorage] uploadNoteAttachment error:', e);
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
  const path = `${userId}/${noteId}/${safeStorageFileName(fileName)}`;
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
