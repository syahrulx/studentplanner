import { supabase } from './supabase';

/**
 * Events and Memos posted from the admin website into the app's Community.
 * They appear in the app as "Admin Rencana" (the account set in
 * admin_settings.rencana_post_author). gradeup-mobile migration
 * 20261013000002_admin_community_posts.sql.
 */

export type AdminPostInput = {
  type: 'event' | 'memo';
  title: string;
  body: string;
  universityId: string | null;
  campus: string | null;
  eventDate: string | null;
  eventTime: string | null;
  location: string | null;
  expiresAt: string | null;
  pinned: boolean;
  /** Public URLs from uploadAdminPostPhoto (up to 3). */
  imageUrls: string[];
};

export async function createAdminPost(input: AdminPostInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_community_post', {
    p_type: input.type,
    p_title: input.title,
    p_body: input.body || null,
    p_university_id: input.universityId,
    p_campus: input.campus,
    p_event_date: input.eventDate,
    p_event_time: input.eventTime,
    p_location: input.location,
    p_expires_at: input.expiresAt,
    p_pinned: input.pinned,
    p_image_urls: input.imageUrls,
  });
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) {
      throw new Error('Posting with photos needs gradeup-mobile migration 20261013000003_admin_community_post_photos.sql. Run it in the Supabase SQL Editor.');
    }
    throw new Error(error.message);
  }
  return data as string;
}

/** Official campus names for a university (public table), for the campus picker. */
export async function listCampusNames(universityId: string): Promise<string[]> {
  const { data } = await supabase.from('campuses').select('name').eq('university_id', universityId).order('name');
  return (data ?? []).map((r: { name: string }) => r.name);
}

/**
 * Shrinks a photo in the browser (longest side 1600 px, JPEG) so posts load
 * fast on phones, then uploads it to the same bucket the app uses
 * (community-images, in the signed-in admin's own folder). Returns its public URL.
 */
export async function uploadAdminPostPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not a photo.');
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in again to upload photos.');

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that photo.'))), 'image/jpeg', 0.85),
  );

  const path = `${uid}/admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('community-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return supabase.storage.from('community-images').getPublicUrl(path).data.publicUrl;
}
