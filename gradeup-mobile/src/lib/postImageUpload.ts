import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { readUriAsBase64 } from './readUriAsBase64';

// Shared helper for uploading a community post image to Supabase Storage. Lives
// in its own module so both eventsApi and servicesApi can use it without
// importing each other (which previously created a require cycle).
export async function uploadPostImage(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const fileName = `${user.id}/${Date.now()}.jpg`;

  try {
    // 1. Read file as base64 (web-safe)
    const base64 = await readUriAsBase64(uri);

    // 2. Convert to ArrayBuffer
    const arrayBuffer = decode(base64);

    // 3. Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('community-images')
      .upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('community-images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (e) {
    console.error('[postImageUpload] uploadPostImage error:', e);
    throw e;
  }
}
