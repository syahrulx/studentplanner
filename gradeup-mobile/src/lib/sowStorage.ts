import { supabase } from './supabase';

export const SOW_FILES_BUCKET = 'sow-files';

export async function uploadSowFile(
  userId: string,
  importId: string,
  fileUri: string,
  fileName: string,
  mimeType?: string
): Promise<{ path: string; error: Error | null }> {
  const safeName = fileName?.trim() || `sow-${Date.now()}.pdf`;
  const path = `${userId}/${importId}/${safeName}`;
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: safeName,
      type: mimeType ?? 'application/pdf',
    } as any);

    const { error } = await supabase.storage.from(SOW_FILES_BUCKET).upload(path, formData, {
      upsert: true,
    });
    return { path, error: error ?? null };
  } catch (e) {
    return { path: '', error: e instanceof Error ? e : new Error(String(e)) };
  }
}

