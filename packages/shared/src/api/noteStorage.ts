import type { SupabaseClient } from '@supabase/supabase-js';

export const NOTE_ATTACHMENTS_BUCKET = 'note-attachments';

export async function uploadNoteAttachmentBlob(
  supabase: SupabaseClient,
  userId: string,
  noteId: string,
  blob: Blob | ArrayBuffer,
  fileName: string,
  mimeType?: string,
): Promise<{ path: string; error: Error | null }> {
  const path = `${userId}/${noteId}/${fileName}`;
  const body = blob instanceof ArrayBuffer ? blob : blob;
  const { error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).upload(path, body, {
    contentType: mimeType ?? (blob instanceof Blob ? blob.type : 'application/octet-stream'),
    upsert: true,
  });
  return { path, error: error ?? null };
}

export async function getNoteAttachmentUrl(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ url: string; error: Error | null }> {
  const { data, error } = await supabase.storage
    .from(NOTE_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 3600);
  return { url: data?.signedUrl ?? '', error: error ?? null };
}

export async function deleteNoteAttachment(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).remove([storagePath]);
  return { error: error ?? null };
}

export async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}
