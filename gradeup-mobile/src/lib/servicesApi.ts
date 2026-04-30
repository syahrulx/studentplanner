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
  /** Snapshot of the agreed amount once an offer is accepted. */
  accepted_amount?: number | null;
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
  author_whatsapp?: string | null;
  claimer_name?: string;
  claimer_avatar?: string | null;
  claimer_whatsapp?: string | null;
}

// ─── Offers (negotiation) ──────────────────────────────────────────────────

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface ServiceOffer {
  id: string;
  service_id: string;
  offerer_id: string;
  amount: number | null;
  currency: string | null;
  message: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;

  // joined
  offerer_name?: string;
  offerer_avatar?: string | null;
  offerer_whatsapp?: string | null;
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
    return `${p.currency === 'MYR' || !p.currency ? 'RM' : p.currency} ${p.price_amount.toLocaleString()}`;
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
    .select('id, name, avatar_url, university, whatsapp_number')
    .in('id', Array.from(ids));

  const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
  for (const r of rows) {
    const a = map.get(r.author_id);
    r.author_name = a?.name || 'Unknown';
    r.author_avatar = a?.avatar_url || null;
    r.author_university = a?.university || null;
    r.author_whatsapp = a?.whatsapp_number || null;

    if (r.claimed_by) {
      const c = map.get(r.claimed_by);
      r.claimer_name = c?.name || 'Unknown';
      r.claimer_avatar = c?.avatar_url || null;
      r.claimer_whatsapp = c?.whatsapp_number || null;
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

// ─── Offer RPCs ────────────────────────────────────────────────────────────

/** Fetch all offers for a service (pending first, then by amount/created). */
export async function fetchOffersForService(serviceId: string): Promise<ServiceOffer[]> {
  const { data, error } = await supabase
    .from('service_offers')
    .select('*')
    .eq('service_id', serviceId)
    .order('status', { ascending: true })
    .order('amount', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as ServiceOffer[];
  if (!rows.length) return rows;

  const offererIds = [...new Set(rows.map((r) => r.offerer_id))];
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, whatsapp_number')
    .in('id', offererIds);
  const pm = new Map((profs ?? []).map((p: any) => [p.id, p]));
  for (const r of rows) {
    const p = pm.get(r.offerer_id);
    r.offerer_name = p?.name || 'Unknown';
    r.offerer_avatar = p?.avatar_url || null;
    r.offerer_whatsapp = p?.whatsapp_number || null;
  }
  return rows;
}

/** Returns the current viewer's pending offer on a service, if any. */
export async function fetchMyPendingOffer(serviceId: string): Promise<ServiceOffer | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('service_offers')
    .select('*')
    .eq('service_id', serviceId)
    .eq('offerer_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) return null;
  return (data as ServiceOffer) || null;
}

export async function makeOffer(input: {
  service_id: string;
  amount: number | null;
  message?: string | null;
}): Promise<ServiceOffer> {
  const { data, error } = await supabase.rpc('make_service_offer', {
    p_service_id: input.service_id,
    p_amount: input.amount,
    p_message: input.message || null,
  });
  if (error) throw error;
  return data as ServiceOffer;
}

export async function withdrawOffer(offerId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_service_offer', { p_offer_id: offerId });
  if (error) throw error;
}

export async function rejectOffer(offerId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_service_offer', { p_offer_id: offerId });
  if (error) throw error;
}

export async function acceptOffer(offerId: string): Promise<ServicePost> {
  const { data, error } = await supabase.rpc('accept_service_offer', { p_offer_id: offerId });
  if (error) throw error;
  return data as ServicePost;
}

// ─── WhatsApp handoff ──────────────────────────────────────────────────────

/**
 * Normalize a phone number to a `wa.me`-compatible E.164-ish digits-only form.
 *
 * Rules:
 *  • If the raw input starts with `+`, we trust the user's country code and
 *    just return the digits — this preserves SG/ID/US numbers etc.
 *  • Otherwise we treat it as a Malaysian local number (the app is
 *    Malaysia-first), strip a leading 0, and prepend `60`.
 *
 * Returns null when the input doesn't look like a valid phone.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hadPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hadPlus) {
    if (digits.length < 8) return null;
    return digits;
  }

  // No + prefix → assume Malaysian local. Drop leading zeros and require
  // at least 9 digits (typical mobile is 9–10 after stripping the 0).
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length < 9) return null;
  // Already starts with the MY country code? Keep as-is; otherwise prepend it.
  if (digits.startsWith('60') && digits.length >= 10) return digits;
  return `60${digits}`;
}

export function buildWhatsAppLink(
  rawNumber: string | null | undefined,
  message?: string,
): string | null {
  const norm = normalizeWhatsAppNumber(rawNumber);
  if (!norm) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${norm}${text}`;
}

export async function getMyWhatsAppNumber(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('whatsapp_number')
    .eq('id', user.id)
    .maybeSingle();
  return (data?.whatsapp_number as string | null) || null;
}

export async function setMyWhatsAppNumber(number: string | null): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const value = number?.trim() || null;
  const { error } = await supabase
    .from('profiles')
    .update({ whatsapp_number: value })
    .eq('id', user.id);
  if (error) throw error;
}

/** Convenience: format the agreed price (uses accepted_amount when available). */
export function formatAgreedPrice(s: ServicePost): string {
  if (s.accepted_amount != null) {
    return `${s.currency === 'MYR' || !s.currency ? 'RM' : s.currency} ${Number(s.accepted_amount).toLocaleString()}`;
  }
  return formatPrice(s);
}

// ─── Service Chat ──────────────────────────────────────────────────────────

export interface ServiceMessage {
  id: string;
  service_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  // joined fields
  sender_name?: string;
  sender_avatar?: string | null;
}

export async function fetchServiceMessages(serviceId: string): Promise<ServiceMessage[]> {
  const { data, error } = await supabase
    .from('service_chat_messages')
    .select('*')
    .eq('service_id', serviceId)
    .order('created_at', { ascending: true });
    
  if (error) {
    console.error('Failed to fetch service messages', error);
    return [];
  }
  
  const rows = (data ?? []) as ServiceMessage[];
  if (!rows.length) return rows;
  
  // Enrich with sender profiles
  const senderIds = [...new Set(rows.map(r => r.sender_id))];
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', senderIds);
    
  const pm = new Map((profs ?? []).map((p: any) => [p.id, p]));
  for (const r of rows) {
    const p = pm.get(r.sender_id);
    r.sender_name = p?.name || 'Unknown';
    r.sender_avatar = p?.avatar_url || null;
  }
  
  return rows;
}

export async function sendServiceMessage(serviceId: string, content: string): Promise<ServiceMessage | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase
    .from('service_chat_messages')
    .insert({
      service_id: serviceId,
      sender_id: user.id,
      content: content.trim()
    })
    .select()
    .single();
    
  if (error) throw error;
  
  const msg = data as ServiceMessage;
  // Pre-fill my own profile since I just sent it
  const { data: prof } = await supabase
    .from('profiles')
    .select('name, avatar_url')
    .eq('id', user.id)
    .single();
    
  if (prof) {
    msg.sender_name = prof.name;
    msg.sender_avatar = prof.avatar_url;
  }
  
  return msg;
}
