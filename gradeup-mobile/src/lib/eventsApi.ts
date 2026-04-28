import { supabase } from './supabase';
import * as ImagePicker from 'expo-image-picker';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PostType = 'event' | 'service' | 'memo';
export type PostStatus = 'active' | 'closed' | 'flagged';

export interface CommunityPost {
  id: string;
  author_id: string;
  post_type: PostType;
  title: string;
  body: string | null;
  image_url: string | null;
  university_id: string | null;
  campus: string | null;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  expires_at: string | null;
  status: PostStatus;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  author_name?: string;
  author_avatar?: string;
  author_university?: string;
}

export interface AuthorityRequest {
  id: string;
  user_id: string;
  university_id: string | null;
  role_title: string;
  justification: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface PostFilters {
  universityId?: string | null;
  campus?: string | null;
  postType?: PostType | null;
  limit?: number;
  offset?: number;
}

// ─── Fetch Posts ─────────────────────────────────────────────────────────────

export async function fetchPosts(filters: PostFilters = {}): Promise<CommunityPost[]> {
  const { universityId, campus, postType, limit = 50, offset = 0 } = filters;

  let query = supabase
    .from('community_posts')
    .select(`
      *,
      profiles!community_posts_author_id_fkey (
        name,
        avatar_url,
        university
      )
    `)
    .eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (universityId) {
    query = query.eq('university_id', universityId);
  }
  if (campus) {
    query = query.eq('campus', campus);
  }
  if (postType) {
    query = query.eq('post_type', postType);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row: any) => ({
    ...row,
    author_name: row.profiles?.name || 'Unknown',
    author_avatar: row.profiles?.avatar_url || null,
    author_university: row.profiles?.university || null,
    profiles: undefined,
  }));
}

// ─── Fetch Single Post ──────────────────────────────────────────────────────

export async function fetchPost(postId: string): Promise<CommunityPost | null> {
  const { data, error } = await supabase
    .from('community_posts')
    .select(`
      *,
      profiles!community_posts_author_id_fkey (
        name,
        avatar_url,
        university
      )
    `)
    .eq('id', postId)
    .single();

  if (error || !data) return null;

  return {
    ...data,
    author_name: (data as any).profiles?.name || 'Unknown',
    author_avatar: (data as any).profiles?.avatar_url || null,
    author_university: (data as any).profiles?.university || null,
    profiles: undefined,
  } as CommunityPost;
}

// ─── Upload Image ───────────────────────────────────────────────────────────

export async function uploadPostImage(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${user.id}/${Date.now()}.${ext}`;

  // Read file as blob
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('community-images')
    .upload(fileName, blob, {
      contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
      upsert: false,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('community-images')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// ─── Create Post ────────────────────────────────────────────────────────────

export interface CreatePostInput {
  post_type: PostType;
  title: string;
  body?: string;
  image_uri?: string; // local URI — will be uploaded
  university_id?: string;
  campus?: string;
  event_date?: string;
  event_time?: string;
  location?: string;
  expires_at?: string;
}

export async function createPost(input: CreatePostInput): Promise<CommunityPost> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let image_url: string | null = null;
  if (input.image_uri) {
    image_url = await uploadPostImage(input.image_uri);
  }

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      author_id: user.id,
      post_type: input.post_type,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      image_url,
      university_id: input.university_id || null,
      campus: input.campus || null,
      event_date: input.event_date || null,
      event_time: input.event_time || null,
      location: input.location?.trim() || null,
      expires_at: input.expires_at || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as CommunityPost;
}

// ─── Update Post ────────────────────────────────────────────────────────────

export async function updatePost(
  postId: string,
  updates: Partial<Pick<CommunityPost, 'title' | 'body' | 'event_date' | 'event_time' | 'location' | 'expires_at' | 'status'>>
): Promise<void> {
  const { error } = await supabase
    .from('community_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', postId);

  if (error) throw error;
}

// ─── Delete Post ────────────────────────────────────────────────────────────

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', postId);

  if (error) throw error;
}

// ─── Authority ──────────────────────────────────────────────────────────────

export async function getMyAuthorityStatus(): Promise<'approved' | 'pending' | 'rejected' | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('authority_status')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;
  return (data as any).authority_status || null;
}

export async function requestAuthority(input: {
  university_id: string;
  role_title: string;
  justification: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Insert request
  const { error: reqError } = await supabase
    .from('authority_requests')
    .insert({
      user_id: user.id,
      university_id: input.university_id,
      role_title: input.role_title.trim(),
      justification: input.justification.trim(),
    });

  if (reqError) throw reqError;

  // Update profile status to pending
  const { error: profError } = await supabase
    .from('profiles')
    .update({ authority_status: 'pending' })
    .eq('id', user.id);

  if (profError) throw profError;
}

export async function getMyAuthorityRequest(): Promise<AuthorityRequest | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('authority_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as AuthorityRequest;
}
