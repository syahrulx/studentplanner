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
  });
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) {
      throw new Error('Posting as Admin Rencana needs gradeup-mobile migration 20261013000002_admin_community_posts.sql. Run it in the Supabase SQL Editor.');
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
