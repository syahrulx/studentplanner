import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
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
  /** Up to 3 photos (portrait or landscape). Preferred over image_url for display. */
  image_urls: string[];
  university_id: string | null;
  campus: string | null;
  campus_id: string | null;
  organization_id: string | null;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  expires_at: string | null;
  status: PostStatus;
  pinned: boolean;
  like_count: number;
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
  campus_id: string | null;
  organization_id: string | null;
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
  campusId?: string | null;
  organizationId?: string | null;
  date?: string | null;
  postType?: PostType | null;
  limit?: number;
  offset?: number;
}

// ─── Fetch Posts ─────────────────────────────────────────────────────────────

export async function fetchPosts(filters: PostFilters = {}): Promise<CommunityPost[]> {
  const { universityId, campus, campusId, organizationId, date, postType, limit = 50, offset = 0 } = filters;

  let query = supabase
    .from('community_posts')
    .select('*')
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
  if (campusId) {
    query = query.eq('campus_id', campusId);
  }
  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }
  if (postType) {
    query = query.eq('post_type', postType);
  } else {
    // Services live in their own marketplace; don't surface them in the events feed.
    query = query.in('post_type', ['event', 'memo']);
  }
  if (date) {
    query = query.eq('event_date', date);
  }

  const { data, error } = await query;
  if (error) throw error;

  const posts = (data || []) as CommunityPost[];

  // Normalise image_urls: if empty, fall back to legacy image_url
  for (const post of posts) {
    if (!Array.isArray(post.image_urls) || post.image_urls.length === 0) {
      post.image_urls = post.image_url ? [post.image_url] : [];
    }
    post.like_count = post.like_count ?? 0;
  }

  // Enrich with author profiles (community_posts.author_id → auth.users, not profiles directly)
  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  if (authorIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, university')
      .in('id', authorIds);
    const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    for (const post of posts) {
      const prof = pmap.get(post.author_id);
      post.author_name = prof?.name || 'Unknown';
      post.author_avatar = prof?.avatar_url || null;
      post.author_university = prof?.university || null;
    }
  }

  return posts;
}

// ─── Fetch Single Post ──────────────────────────────────────────────────────

export async function fetchPost(postId: string): Promise<CommunityPost | null> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (error || !data) return null;

  const post = data as CommunityPost;

  // Normalise image_urls
  if (!Array.isArray(post.image_urls) || post.image_urls.length === 0) {
    post.image_urls = post.image_url ? [post.image_url] : [];
  }
  post.like_count = post.like_count ?? 0;

  // Enrich with author profile
  const { data: prof } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, university')
    .eq('id', post.author_id)
    .maybeSingle();

  post.author_name = (prof as any)?.name || 'Unknown';
  post.author_avatar = (prof as any)?.avatar_url || null;
  post.author_university = (prof as any)?.university || null;

  return post;
}

// ... (types remains the same)

export async function uploadPostImage(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const fileName = `${user.id}/${Date.now()}.jpg`;

  try {
    // 1. Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

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
    console.error('[eventsApi] uploadPostImage error:', e);
    throw e;
  }
}

// ─── Create Post ────────────────────────────────────────────────────────────

export interface CreatePostInput {
  post_type: PostType;
  title: string;
  body?: string;
  /** Up to 3 local image URIs — will be uploaded to Supabase Storage. */
  image_uris?: string[];
  /** @deprecated use image_uris */
  image_uri?: string;
  university_id?: string;
  campus?: string;
  campus_id?: string;
  organization_id?: string;
  event_date?: string;
  event_time?: string;
  location?: string;
  expires_at?: string;
}

export async function createPost(input: CreatePostInput): Promise<CommunityPost> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Support both new image_uris array and legacy image_uri
  const urisToUpload: string[] = [
    ...(input.image_uris ?? []),
    ...(input.image_uri && !input.image_uris ? [input.image_uri] : []),
  ].slice(0, 3);

  const uploadedUrls: string[] = [];
  for (const uri of urisToUpload) {
    const url = await uploadPostImage(uri);
    uploadedUrls.push(url);
  }

  const image_url = uploadedUrls[0] ?? null;

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      author_id: user.id,
      post_type: input.post_type,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      image_url,
      image_urls: uploadedUrls,
      university_id: input.university_id || null,
      campus: input.campus || null,
      campus_id: input.campus_id || null,
      organization_id: input.organization_id || null,
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
  updates: Partial<
    Pick<
      CommunityPost,
      | 'title'
      | 'body'
      | 'event_date'
      | 'event_time'
      | 'location'
      | 'expires_at'
      | 'status'
      | 'university_id'
      | 'campus'
      | 'campus_id'
      | 'image_url'
      | 'image_urls'
    >
  >
): Promise<void> {
  const { error } = await supabase
    .from('community_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', postId);

  if (error) throw error;
}

// ─── Likes ───────────────────────────────────────────────────────────────────

export async function likePost(postId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Ignore duplicate errors (already liked)
  await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
}

export async function unlikePost(postId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
}

/** Returns a Set of post IDs that the current user has liked. */
export async function getMyLikes(postIds: string[]): Promise<Set<string>> {
  if (!postIds.length) return new Set();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds);
  return new Set((data ?? []).map((r: any) => r.post_id));
}

// ─── Share URL ───────────────────────────────────────────────────────────────

const EVENT_SHARE_BASE =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_INVITE_HTTP_BASE) ||
  'https://aizztech.com';

/** Generate a shareable deep-link URL for an event post. */
export function generateEventShareLink(postId: string): string {
  const base = String(EVENT_SHARE_BASE).replace(/\/$/, '');
  return `${base}/events?id=${encodeURIComponent(postId)}`;
}

// ─── Report Post (Apple UGC compliance) ─────────────────────────────────────

export type ReportReason = 'inappropriate' | 'spam' | 'misleading' | 'harassment' | 'other';

export async function reportPost(postId: string, reason: ReportReason = 'inappropriate'): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Ignore duplicate (already reported)
  await supabase.from('post_reports').insert({ post_id: postId, reporter_id: user.id, reason });
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
  campus_id?: string;
  organization_id?: string;
  role_title: string;
  justification: string;
  proof_uri?: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Upload proof image if provided
  let proof_url: string | null = null;
  if (input.proof_uri) {
    proof_url = await uploadPostImage(input.proof_uri);
  }

  // Insert request
  const { error: reqError } = await supabase
    .from('authority_requests')
    .insert({
      user_id: user.id,
      university_id: input.university_id,
      campus_id: input.campus_id || null,
      organization_id: input.organization_id || null,
      role_title: input.role_title.trim(),
      justification: input.justification.trim(),
      proof_url,
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

// ─── Fetch Campuses & Organizations ─────────────────────────────────────────

export interface University {
  id: string;
  name: string;
}

export interface Campus {
  id: string;
  university_id: string;
  name: string;
}

export interface Organization {
  id: string;
  university_id: string;
  campus_id: string | null;
  name: string;
}

export async function fetchUniversities(): Promise<University[]> {
  const { data, error } = await supabase
    .from('universities')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return data as University[];
}

export async function fetchCampuses(universityId: string): Promise<Campus[]> {
  const { data, error } = await supabase
    .from('campuses')
    .select('*')
    .eq('university_id', universityId)
    .order('name');
  if (error) throw error;
  return data as Campus[];
}

export async function fetchOrganizations(universityId: string, campusId?: string): Promise<Organization[]> {
  let query = supabase
    .from('organizations')
    .select('*')
    .eq('university_id', universityId)
    .order('name');
  if (campusId) {
    query = query.eq('campus_id', campusId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as Organization[];
}
