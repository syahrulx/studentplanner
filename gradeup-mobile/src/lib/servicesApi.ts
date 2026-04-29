import { supabase } from './supabase';
import { uploadPostImage } from './eventsApi';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ServiceKind = 'request' | 'offer';
export type ServiceStatus = 'open' | 'claimed' | 'completed' | 'cancelled';
export type PriceType = 'free' | 'fixed' | 'negotiable';

export interface ServiceCategory {
  id: string;
  label: string;
  emoji: string;
  icon: string; // Feather name
  tint: string;
}

/** Curated category list — shown in compose & filter pills. */
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: 'tutoring',  label: 'Tutoring',   emoji: '📚', icon: 'book-open',   tint: '#0A84FF' },
  { id: 'printing',  label: 'Printing',   emoji: '🖨️', icon: 'printer',     tint: '#5E5CE6' },
  { id: 'transport', label: 'Transport',  emoji: '🚗', icon: 'navigation', tint: '#30D158' },
  { id: 'food',      label: 'Food run',   emoji: '🍱', icon: 'shopping-bag', tint: '#FF9F0A' },
  { id: 'errands',   label: 'Errands',    emoji: '🧺', icon: 'package',     tint: '#FF453A' },
  { id: 'tech',      label: 'Tech help',  emoji: '💻', icon: 'cpu',         tint: '#64D2FF' },
  { id: 'design',    label: 'Design',     emoji: '🎨', icon: 'edit-3',      tint: '#BF5AF2' },
  { id: 'other',     label: 'Other',      emoji: '✨', icon: 'star',        tint: '#8E8E93' },
];

export function getCategory(id?: string | null): ServiceCategory {
  return SERVICE_CATEGORIES.find((c) => c.id === id) || SERVICE_CATEGORIES[SERVICE_CATEGORIES.length - 1];
}

export interface ServicePost {
  id: string;
  author_id: string;
  post_type: 'service';
  title: string;
  body: string | null;
  image_url: string | null;
  university_id: string | null;
  campus: string | null;
  location: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;

  // service-specific
  service_kind: ServiceKind | null;
  service_category: string | null;
  price_type: PriceType | null;
  price_amount: number | null;
  currency: string | null;
  service_status: ServiceStatus;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  deadline_at: string | null;

  // joined
  author_name?: string;
  author_avatar?: string | null;
  author_university?: string | null;
  claimer_name?: string;
  claimer_avatar?: string | null;
}

export interface ServiceFilters {
  kind?: ServiceKind | null;
  status?: ServiceStatus | null;
  category?: string | null;
  universityId?: string | null;
  search?: string | null;
  scope?: 'all' | 'mine' | 'taken';
  limit?: number;
}

// ─── Format helpers ─────────────────────────────────────────────────────────

export function formatPrice(p: Pick<ServicePost, 'price_type' | 'price_amount' | 'currency'>): string {
  if (p.price_type === 'free') return 'Free';
  if (p.price_type === 'fixed' && p.price_amount != null) {
    return `${p.currency || 'MYR'} ${p.price_amount.toLocaleString()}`;
  }
  return 'Negotiable';
}

const STATUS_META: Record<ServiceStatus, { label: string; tint: string; bg: string }> = {
  open:      { label: 'Open',      tint: '#30D158', bg: '#30D15822' },
  claimed:   { label: 'In progress', tint: '#FF9F0A', bg: '#FF9F0A22' },
  completed: { label: 'Completed', tint: '#0A84FF', bg: '#0A84FF22' },
  cancelled: { label: 'Cancelled', tint: '#8E8E93', bg: '#8E8E9322' },
};

export function statusMeta(status: ServiceStatus) {
  return STATUS_META[status] || STATUS_META.open;
}

// ─── List ──────────────────────────────────────────────────────────────────

export async function fetchServices(filters: ServiceFilters = {}): Promise<ServicePost[]> {
  const { kind, status, category, universityId, search, scope = 'all', limit = 60 } = filters;

  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from('community_posts')
    .select('*')
    .eq('post_type', 'service')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (kind) query = query.eq('service_kind', kind);
  if (status) query = query.eq('service_status', status);
  if (category) query = query.eq('service_category', category);
  if (universityId) query = query.eq('university_id', universityId);
  if (search?.trim()) query = query.ilike('title', `%${search.trim()}%`);

  if (scope === 'mine' && user) query = query.eq('author_id', user.id);
  if (scope === 'taken' && user) query = query.eq('claimed_by', user.id);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ServicePost[];
  return enrichWithProfiles(rows);
}

async function enrichWithProfiles(rows: ServicePost[]): Promise<ServicePost[]> {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.author_id) ids.add(r.author_id);
    if (r.claimed_by) ids.add(r.claimed_by);
  }
  if (!ids.size) return rows;

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, university')
    .in('id', Array.from(ids));

  const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
  for (const r of rows) {
    const a = map.get(r.author_id);
    r.author_name = a?.name || 'Unknown';
    r.author_avatar = a?.avatar_url || null;
    r.author_university = a?.university || null;

    if (r.claimed_by) {
      const c = map.get(r.claimed_by);
      r.claimer_name = c?.name || 'Unknown';
      r.claimer_avatar = c?.avatar_url || null;
    }
  }
  return rows;
}

// ─── Detail ────────────────────────────────────────────────────────────────

export async function fetchService(id: string): Promise<ServicePost | null> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*')
    .eq('id', id)
    .eq('post_type', 'service')
    .maybeSingle();

  if (error || !data) return null;

  const enriched = await enrichWithProfiles([data as ServicePost]);
  return enriched[0] || null;
}

// ─── Create / Update / Delete ──────────────────────────────────────────────

export interface CreateServiceInput {
  kind: ServiceKind;
  title: string;
  body?: string;
  image_uri?: string;
  category: string;
  price_type: PriceType;
  price_amount?: number;
  currency?: string;
  location?: string;
  deadline_at?: string;
  university_id?: string;
  campus?: string;
}

export async function createService(input: CreateServiceInput): Promise<ServicePost> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let image_url: string | null = null;
  if (input.image_uri) image_url = await uploadPostImage(input.image_uri);

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      author_id: user.id,
      post_type: 'service',
      title: input.title.trim(),
      body: input.body?.trim() || null,
      image_url,
      university_id: input.university_id || null,
      campus: input.campus || null,
      location: input.location?.trim() || null,
      service_kind: input.kind,
      service_category: input.category,
      price_type: input.price_type,
      price_amount: input.price_type === 'fixed' ? input.price_amount ?? null : null,
      currency: input.currency || 'MYR',
      service_status: 'open',
      deadline_at: input.deadline_at || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ServicePost;
}

export async function updateService(
  id: string,
  patch: Partial<Pick<ServicePost,
    'title' | 'body' | 'image_url' | 'service_category' | 'price_type' | 'price_amount' |
    'currency' | 'location' | 'deadline_at' | 'service_kind'
  >>
): Promise<void> {
  const { error } = await supabase
    .from('community_posts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase.from('community_posts').delete().eq('id', id);
  if (error) throw error;
}

// ─── State transitions (RPCs) ──────────────────────────────────────────────

export async function claimService(id: string): Promise<void> {
  const { error } = await supabase.rpc('claim_service', { p_service_id: id });
  if (error) throw error;
}

export async function unclaimService(id: string): Promise<void> {
  const { error } = await supabase.rpc('unclaim_service', { p_service_id: id });
  if (error) throw error;
}

export async function completeService(id: string): Promise<void> {
  const { error } = await supabase.rpc('complete_service', { p_service_id: id });
  if (error) throw error;
}

export async function cancelService(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_service', { p_service_id: id });
  if (error) throw error;
}

// ─── Reviews ───────────────────────────────────────────────────────────────

export interface ServiceReview {
  id: string;
  service_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name?: string;
  reviewer_avatar?: string;
}

export async function fetchReviewsForUser(userId: string): Promise<ServiceReview[]> {
  const { data, error } = await supabase
    .from('service_reviews')
    .select('*')
    .eq('reviewee_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ServiceReview[];
}

export async function fetchReviewsForService(serviceId: string): Promise<ServiceReview[]> {
  const { data, error } = await supabase
    .from('service_reviews')
    .select('*')
    .eq('service_id', serviceId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as ServiceReview[];
  if (!rows.length) return rows;

  const reviewerIds = [...new Set(rows.map((r) => r.reviewer_id))];
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', reviewerIds);
  const pm = new Map((profs ?? []).map((p: any) => [p.id, p]));
  for (const r of rows) {
    const p = pm.get(r.reviewer_id);
    r.reviewer_name = p?.name || 'Unknown';
    r.reviewer_avatar = p?.avatar_url || null;
  }
  return rows;
}

export async function submitReview(input: {
  service_id: string;
  reviewee_id: string;
  rating: number;
  comment?: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('service_reviews').upsert(
    {
      service_id: input.service_id,
      reviewer_id: user.id,
      reviewee_id: input.reviewee_id,
      rating: input.rating,
      comment: input.comment?.trim() || null,
    },
    { onConflict: 'service_id,reviewer_id' }
  );
  if (error) throw error;
}

// ─── Helper: derive UI state for current viewer ────────────────────────────

export type ViewerRole = 'requester' | 'taker' | 'observer';

export function getViewerRole(s: ServicePost, viewerId?: string | null): ViewerRole {
  if (!viewerId) return 'observer';
  if (s.author_id === viewerId) return 'requester';
  if (s.claimed_by === viewerId) return 'taker';
  return 'observer';
}
