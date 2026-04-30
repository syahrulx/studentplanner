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
  campus_id: string | null;
  organization_id: string | null;
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

// ─── Upload Image ───────────────────────────────────────────────────────────

export async function uploadPostImage(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const fileName = `${user.id}/${Date.now()}.jpg`;

  // React Native: use FormData with file URI object (most reliable method)
  const formData = new FormData();
  formData.append('', {
    uri,
    name: fileName,
    type: 'image/jpeg',
  } as any);

  const { error } = await supabase.storage
    .from('community-images')
    .upload(fileName, formData, {
      contentType: 'multipart/form-data',
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
