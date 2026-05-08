import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { uploadPostImage } from './eventsApi';

// ─── Content Moderation ─────────────────────────────────────────────────────

/** Banned keywords — must stay in sync with the DB trigger `check_service_content`. */
const BANNED_KEYWORDS: string[] = [
  'sex', 'sexual', 'escort', 'prostitut', 'hookup', 'hook up',
  'onlyfans', 'only fans', 'sugar daddy', 'sugar baby', 'sugarbaby',
  'sugardaddy', 'sugar mommy', 'sugarmommy',
  'massage happy ending', 'happy ending',
  'erotic', 'porn', 'xxx', 'nude', 'nudes', 'blowjob', 'handjob',
  'bdsm', 'fetish', 'dominatrix', 'cam girl', 'camgirl',
  'booty call', 'bootycall', 'friends with benefits', 'fwb',
  'one night stand',
  'drugs', 'weed', 'ganja', 'marijuana', 'cocaine', 'meth',
  'ketamine', 'ecstasy', 'mdma', 'lsd', 'heroin',
  'dadah', 'syabu',
  'gun', 'firearm', 'weapon', 'explosive',
  'write my exam', 'take my exam', 'sit my exam',
  'fake degree', 'fake certificate', 'fake diploma',
  'gambling', 'judi', 'casino', 'sports betting', 'bet365',
];

/** Returns a banned word if found, or null if the content is clean. */
export function checkContentModeration(title: string, body?: string | null): string | null {
  const text = `${title} ${body || ''}`.toLowerCase();
  for (const word of BANNED_KEYWORDS) {
    if (text.includes(word)) return word;
  }
  return null;
}

// ─── Student Verification ───────────────────────────────────────────────────

const STUDENT_EMAIL_PATTERNS = [
  /\.edu$/i,
  /\.edu\.\w{2}$/i,       // .edu.my, .edu.sg, etc.
  /@student\./i,
  /@students\./i,
  /@sis\./i,
  /@siswa\./i,
  /@isiswa\./i,          // UiTM
  /@graduate\./i,         // UTM
  /@imail\./i,            // Sunway
  /@sd\./i,               // Taylor's
  /@live\./i,             // IIUM, UiTM
];

/** Check if an email looks like a student/edu email. */
export function isStudentEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return STUDENT_EMAIL_PATTERNS.some((p) => p.test(email));
}

export type VerificationStatus = 'verified' | 'pending' | 'rejected' | 'none';

/** Get the current user's student verification status. */
export async function getStudentVerificationStatus(): Promise<{
  status: VerificationStatus;
  studentEmail?: string;
  adminNote?: string;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'none' };

  // 1. Check if email is already a student email → auto-verified
  if (isStudentEmail(user.email)) {
    return { status: 'verified' };
  }

  // 2. Check if profile has student_verified = true
  const { data: profile } = await supabase
    .from('profiles')
    .select('student_verified')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.student_verified) {
    return { status: 'verified' };
  }

  // 3. Check verification requests table
  const { data: request } = await supabase
    .from('student_verification_requests')
    .select('status, student_email, admin_note')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!request) {
    return { status: 'none' };
  }

  if (request.status === 'approved') {
    // Sync the profile flag (edge case recovery)
    await supabase.from('profiles').update({ student_verified: true }).eq('id', user.id);
    return { status: 'verified' };
  }

  return {
    status: request.status as VerificationStatus,
    studentEmail: request.student_email,
    adminNote: request.admin_note ?? undefined,
  };
}

/** Send a 6-digit OTP code to the provided student email via Edge Function. */
export async function sendStudentVerificationOtp(studentEmail: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const fnUrl = `${(supabase as any).supabaseUrl}/functions/v1/send-student-otp`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': (supabase as any).supabaseKey,
    },
    body: JSON.stringify({ student_email: studentEmail.trim().toLowerCase() }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to send verification code');
  return json.status || 'sent';
}

/** Verify the OTP code sent to the student email. */
export async function verifyStudentOtp(code: string): Promise<{ status: string; message?: string }> {
  const { data, error } = await supabase.rpc('verify_student_otp', {
    p_code: code.trim(),
  });
  if (error) throw error;
  return data as any;
}
// ─── Types ──────────────────────────────────────────────────────────────────

export type ServiceKind = 'request' | 'offer';
export type ServiceStatus = 'open' | 'claimed' | 'submitted' | 'completed' | 'cancelled';
export type PriceType = 'free' | 'fixed' | 'negotiable';

/** Set by the author when creating the post. open_service → reusable listing offers + 7-day window. */
export type ServiceNegotiationMode = 'standard' | 'open_service';

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
  submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_requested_by: string | null;
  deadline_at: string | null;

  /** Author chose at create time (default standard). */
  service_negotiation_mode?: ServiceNegotiationMode | null;
  /** When mode is open_service, post stops accepting activity after this instant (typically +7 days). */
  open_service_expires_at?: string | null;

  // delivery & revision tracking
  delivery_note: string | null;
  delivery_attachments: string[];
  max_revisions: number;
  revision_count: number;

  // joined
  author_name?: string;
  author_avatar?: string | null;
  author_university?: string | null;
  author_whatsapp?: string | null;
  claimer_name?: string;
  claimer_avatar?: string | null;
  claimer_whatsapp?: string | null;
  author_rating?: number | null;
  author_reviews?: number;
  claimer_rating?: number | null;
  claimer_reviews?: number;
  
  // local only
  unread_chat_count?: number;
}

// ─── Offers (negotiation) ──────────────────────────────────────────────────

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

/** exclusive = one acceptance can win the job. open_listing = reusable; track uses instead of accept. */
export type OfferKind = 'exclusive' | 'open_listing';

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
  /** DB column; default exclusive when missing (older migrations). */
  offer_kind?: OfferKind;

  // joined
  offerer_name?: string;
  offerer_avatar?: string | null;
  offerer_whatsapp?: string | null;
  offerer_rating?: number | null;
  offerer_reviews?: number;

  /** Populated for open_listing offers after fetch (usage rows). */
  feedback_up_count?: number;
  feedback_down_count?: number;
  /** Current viewer’s vote on this offer row, if any. */
  my_feedback?: 'up' | 'down' | null;
  /** Students who left positive feedback (open listings); max ~12 for UI. */
  feedback_preview?: OfferFeedbackFace[];
  /** Unread open-listing DM messages for the current viewer (offer DM thread). */
  offer_dm_unread?: number;
}

export interface OfferFeedbackFace {
  user_id: string;
  name: string;
  avatar_url: string | null;
}

/** Aggregate thumbs on open listing rows under this service. */
export interface OpenListingFeedbackSummary {
  thumbsUp: number;
  thumbsDown: number;
  /** Distinct users who left at least one thumbs-up on some listing row. */
  positiveContributors: number;
  preview: OfferFeedbackFace[];
}

export interface ServiceFilters {
  kind?: ServiceKind | null;
  status?: ServiceStatus | null;
  category?: string | null;
  universityId?: string | null;
  campus?: string | null;
  search?: string | null;
  scope?: 'all' | 'mine' | 'taken';
  orderBy?: 'newest' | 'price_asc' | 'price_desc' | 'deadline_asc';
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
  open:      { label: 'Open',        tint: '#30D158', bg: '#30D15822' },
  claimed:   { label: 'In Progress', tint: '#FF9F0A', bg: '#FF9F0A22' },
  submitted: { label: 'Pending Review', tint: '#BF5AF2', bg: '#BF5AF222' },
  completed: { label: 'Completed',   tint: '#0A84FF', bg: '#0A84FF22' },
  cancelled: { label: 'Cancelled',   tint: '#8E8E93', bg: '#8E8E9322' },
};

export function statusMeta(status: ServiceStatus) {
  return STATUS_META[status] || STATUS_META.open;
}

// ─── List ──────────────────────────────────────────────────────────────────

export async function fetchServices(filters: ServiceFilters = {}): Promise<ServicePost[]> {
  const { kind, status, category, universityId, campus, search, scope = 'all', limit = 60 } = filters;

  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from('community_posts')
    .select('*')
    .eq('post_type', 'service')
    .limit(limit);

  if (filters.orderBy === 'price_asc') {
    query = query.order('price_amount', { ascending: true, nullsFirst: false });
  } else if (filters.orderBy === 'price_desc') {
    query = query.order('price_amount', { ascending: false, nullsFirst: false });
  } else if (filters.orderBy === 'deadline_asc') {
    query = query.order('deadline_at', { ascending: true, nullsFirst: false });
  } else {
    // default newest
    query = query.order('pinned', { ascending: false }).order('created_at', { ascending: false });
  }

  if (kind) query = query.eq('service_kind', kind);
  if (status) query = query.eq('service_status', status);
  if (category) query = query.eq('service_category', category);
  if (universityId) query = query.eq('university_id', universityId);
  if (campus) query = query.eq('campus', campus);
  if (search?.trim()) query = query.ilike('title', `%${search.trim()}%`);

  if (scope === 'mine' && user) {
    query = query.eq('author_id', user.id);
  } else if (scope === 'taken' && user) {
    query = query.eq('claimed_by', user.id);
  } else if (scope === 'all' && !status) {
    // Hide completed and cancelled from the general browse feed unless specifically filtering for them
    query = query.in('service_status', ['open', 'claimed', 'submitted']);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ServicePost[];
  return enrichWithProfiles(rows, user?.id);
}

async function enrichWithProfiles(rows: ServicePost[], currentUserId?: string): Promise<ServicePost[]> {
  if (!rows.length) return rows;
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.author_id) ids.add(r.author_id);
    if (r.claimed_by) ids.add(r.claimed_by);
  }

  // 1. Fetch profiles
  const profilesPromise = ids.size > 0 
    ? supabase
        .from('profiles')
        .select('id, name, avatar_url, university, whatsapp_number, average_rating, total_reviews')
        .in('id', Array.from(ids))
    : Promise.resolve({ data: [] });

  // 2. Fetch unread counts for these services (only if logged in)
  const serviceIds = rows.map(r => r.id);
  const unreadPromise = currentUserId
    ? supabase
        .from('service_chat_messages')
        .select('service_id')
        .in('service_id', serviceIds)
        .is('read_at', null)
        .neq('sender_id', currentUserId)
    : Promise.resolve({ data: [] });

  const [{ data: profs }, { data: unreadMsgs }] = await Promise.all([profilesPromise, unreadPromise]);

  // Map unread counts
  const unreadCounts = new Map<string, number>();
  for (const m of (unreadMsgs || [])) {
    unreadCounts.set(m.service_id, (unreadCounts.get(m.service_id) || 0) + 1);
  }

  const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
  for (const r of rows) {
    const a = map.get(r.author_id);
    r.author_name = a?.name || 'Student';
    r.author_avatar = a?.avatar_url || null;
    r.author_university = a?.university || null;
    r.author_whatsapp = a?.whatsapp_number || null;
    r.author_rating = a?.average_rating ?? null;
    r.author_reviews = a?.total_reviews ?? 0;

    if (r.claimed_by) {
      const c = map.get(r.claimed_by);
      r.claimer_name = c?.name || 'Student';
      r.claimer_avatar = c?.avatar_url || null;
      r.claimer_whatsapp = c?.whatsapp_number || null;
      r.claimer_rating = c?.average_rating ?? null;
      r.claimer_reviews = c?.total_reviews ?? 0;
    }
    
    r.unread_chat_count = unreadCounts.get(r.id) || 0;
  }
  return rows;
}

// ─── Detail ────────────────────────────────────────────────────────────────

export async function fetchService(id: string): Promise<ServicePost | null> {
  const syncRes = await supabase.rpc('sync_open_service_expiry', { p_service_id: id });
  void syncRes.error;

  const { data, error } = await supabase
    .from('community_posts')
    .select('*')
    .eq('id', id)
    .eq('post_type', 'service')
    .maybeSingle();

  if (error || !data) return null;

  const { data: { user } } = await supabase.auth.getUser();
  const enriched = await enrichWithProfiles([data as ServicePost], user?.id);
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
  /** Author-only: standard job vs open marketplace (7-day window). */
  negotiation_mode?: ServiceNegotiationMode;
}

export async function createService(input: CreateServiceInput): Promise<ServicePost> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Content moderation: block explicit/prohibited content
  const bannedWord = checkContentModeration(input.title, input.body);
  if (bannedWord) {
    throw new Error('This content violates our community guidelines. Explicit, illegal, or prohibited services are not allowed.');
  }

  let image_url: string | null = null;
  if (input.image_uri) image_url = await uploadPostImage(input.image_uri);

  const mode: ServiceNegotiationMode = input.negotiation_mode ?? 'standard';
  const openUntil =
    mode === 'open_service'
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;

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
      service_negotiation_mode: mode,
      open_service_expires_at: openUntil,
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
    'currency' | 'location' | 'deadline_at' | 'service_kind' | 'university_id' | 'campus'
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

// ─── Two-Step Completion ───────────────────────────────────────────────────

export async function submitService(
  id: string,
  opts?: { note?: string; attachmentUris?: string[] }
): Promise<void> {
  let attachmentUrls: string[] = [];

  // Upload attachments if provided
  if (opts?.attachmentUris?.length) {
    attachmentUrls = await Promise.all(
      opts.attachmentUris.map((uri) => uploadDeliveryAttachment(uri))
    );
  }

  const { error } = await supabase.rpc('submit_service', {
    p_service_id: id,
    p_delivery_note: opts?.note || null,
    p_delivery_attachments: attachmentUrls,
  });
  if (error) throw error;
}

export async function approveService(id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_service', { p_service_id: id });
  if (error) throw error;
}

export async function rejectService(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_service', { p_service_id: id, p_reason: reason });
  if (error) throw error;
}

// ─── Cancellations & Dropping ──────────────────────────────────────────────

export async function quitService(id: string): Promise<void> {
  const { error } = await supabase.rpc('quit_service', { p_service_id: id });
  if (error) throw error;
}

export async function requestCancelService(id: string): Promise<void> {
  const { error } = await supabase.rpc('request_cancel_service', { p_service_id: id });
  if (error) throw error;
}

export async function acceptCancelService(id: string): Promise<void> {
  const { error } = await supabase.rpc('accept_cancel_service', { p_service_id: id });
  if (error) throw error;
}

export async function reportService(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('report_service', { p_service_id: id, p_reason: reason });
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
    r.reviewer_name = p?.name || 'Student';
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
export async function fetchOffersForService(serviceId: string): Promise<{
  offers: ServiceOffer[];
  openListingFeedbackSummary: OpenListingFeedbackSummary | null;
}> {
  const { data, error } = await supabase
    .from('service_offers')
    .select('*')
    .eq('service_id', serviceId)
    .order('status', { ascending: true })
    .order('amount', { ascending: true })
    .order('created_at', { ascending: false });
  // PGRST205: table not in schema (migration not applied on this project yet)
  if (error?.code === 'PGRST205') return { offers: [], openListingFeedbackSummary: null };
  if (error) throw error;

  const rows = (data ?? []) as ServiceOffer[];
  if (!rows.length) return { offers: [], openListingFeedbackSummary: null };

  const offererIds = [...new Set(rows.map((r) => r.offerer_id))];
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, whatsapp_number, average_rating, total_reviews')
    .in('id', offererIds);
  const pm = new Map((profs ?? []).map((p: any) => [p.id, p]));
  for (const o of rows) {
    const p = pm.get(o.offerer_id);
    o.offerer_name = p?.name || 'Student';
    o.offerer_avatar = p?.avatar_url || null;
    o.offerer_whatsapp = p?.whatsapp_number || null;
    o.offerer_rating = p?.average_rating ?? null;
    o.offerer_reviews = p?.total_reviews ?? 0;
  }

  const listingIds = rows
    .filter((r) => (r.offer_kind ?? 'exclusive') === 'open_listing')
    .map((r) => r.id);

  let openListingFeedbackSummary: OpenListingFeedbackSummary | null = null;

  if (listingIds.length > 0) {
    const { data: sessionUser } = await supabase.auth.getUser();
    const uid = sessionUser?.user?.id ?? null;
    const { data: usageRows, error: usageErr } = await supabase
      .from('service_offer_usages')
      .select('offer_id, user_id, worked')
      .in('offer_id', listingIds);
    if (!usageErr && usageRows) {
      type UsageRow = { offer_id: string; user_id: string; worked?: boolean | null };
      const upMap = new Map<string, number>();
      const downMap = new Map<string, number>();
      const usersByOfferPositive = new Map<string, string[]>();
      const mineByOffer = new Map<string, 'up' | 'down'>();

      let thumbsUp = 0;
      let thumbsDown = 0;
      for (const u of usageRows as UsageRow[]) {
        const worked = u.worked !== false;
        if (worked) {
          thumbsUp++;
          upMap.set(u.offer_id, (upMap.get(u.offer_id) ?? 0) + 1);
          const arr = usersByOfferPositive.get(u.offer_id) ?? [];
          if (!arr.includes(u.user_id)) arr.push(u.user_id);
          usersByOfferPositive.set(u.offer_id, arr);
        } else {
          thumbsDown++;
          downMap.set(u.offer_id, (downMap.get(u.offer_id) ?? 0) + 1);
        }
        if (uid && u.user_id === uid) {
          mineByOffer.set(u.offer_id, worked ? 'up' : 'down');
        }
      }

      const distinctPositiveOrder: string[] = [];
      const seenPos = new Set<string>();
      for (const u of usageRows as UsageRow[]) {
        if (u.worked === false) continue;
        if (!seenPos.has(u.user_id)) {
          seenPos.add(u.user_id);
          distinctPositiveOrder.push(u.user_id);
        }
      }

      let faceMap = new Map<string, OfferFeedbackFace>();
      if (distinctPositiveOrder.length > 0) {
        const { data: fbProfs } = await supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', distinctPositiveOrder);
        faceMap = new Map(
          (fbProfs ?? []).map((p: { id: string; name: string | null; avatar_url: string | null }) => [
            p.id,
            {
              user_id: p.id,
              name: p.name?.trim() || 'Student',
              avatar_url: p.avatar_url ?? null,
            } as OfferFeedbackFace,
          ])
        );
      }

      openListingFeedbackSummary = {
        thumbsUp,
        thumbsDown,
        positiveContributors: distinctPositiveOrder.length,
        preview: distinctPositiveOrder
          .slice(0, 12)
          .map((id) => faceMap.get(id))
          .filter((x): x is OfferFeedbackFace => x != null),
      };

      for (const o of rows) {
        if ((o.offer_kind ?? 'exclusive') === 'open_listing') {
          o.feedback_up_count = upMap.get(o.id) ?? 0;
          o.feedback_down_count = downMap.get(o.id) ?? 0;
          o.my_feedback = uid ? mineByOffer.get(o.id) ?? null : null;
          const ids = usersByOfferPositive.get(o.id) ?? [];
          o.feedback_preview = ids
            .slice(0, 12)
            .map((id) => faceMap.get(id))
            .filter((x): x is OfferFeedbackFace => x != null);
        }
      }
    }

    if (uid) {
      const { data: threads } = await supabase
        .from('service_offer_dm_threads')
        .select('id, offer_id')
        .in('offer_id', listingIds);
      if (threads?.length) {
        const offerByThread = new Map(
          (threads as { id: string; offer_id: string }[]).map((t) => [t.id, t.offer_id])
        );
        const threadIds = [...offerByThread.keys()];
        const { data: unreadMsgs } = await supabase
          .from('service_offer_dm_messages')
          .select('thread_id')
          .in('thread_id', threadIds)
          .is('read_at', null)
          .neq('sender_id', uid);
        const countByOffer = new Map<string, number>();
        for (const m of unreadMsgs ?? []) {
          const tid = (m as { thread_id: string }).thread_id;
          const oid = offerByThread.get(tid);
          if (oid) countByOffer.set(oid, (countByOffer.get(oid) ?? 0) + 1);
        }
        for (const o of rows) {
          if ((o.offer_kind ?? 'exclusive') === 'open_listing') {
            o.offer_dm_unread = countByOffer.get(o.id) ?? 0;
          }
        }
      }
    }
  }

  return { offers: rows, openListingFeedbackSummary };
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

/** Record thumbs up/down for an open listing offer (one vote per user; can change). */
export async function recordOfferUse(
  offerId: string,
  worked: boolean
): Promise<{
  positive_count: number;
  negative_count: number;
  newly_recorded: boolean;
}> {
  const { data, error } = await supabase.rpc('record_service_offer_use', {
    p_offer_id: offerId,
    p_worked: worked,
  });
  if (error) throw error;
  const d = data as {
    positive_count?: number;
    negative_count?: number;
    newly_recorded?: boolean;
  };
  return {
    positive_count: Number(d.positive_count ?? 0),
    negative_count: Number(d.negative_count ?? 0),
    newly_recorded: !!d.newly_recorded,
  };
}

/** Usage counts and current viewer vote for one open-listing offer. */
export async function fetchOfferFeedbackSnapshot(offerId: string): Promise<{
  up: number;
  down: number;
  mine: 'up' | 'down' | null;
}> {
  const { data: sessionUser } = await supabase.auth.getUser();
  const uid = sessionUser?.user?.id ?? null;

  const { data: rows, error } = await supabase
    .from('service_offer_usages')
    .select('user_id, worked')
    .eq('offer_id', offerId);
  if (error?.code === 'PGRST205') return { up: 0, down: 0, mine: null };
  if (error) throw error;

  let up = 0;
  let down = 0;
  let mine: 'up' | 'down' | null = null;
  for (const r of rows ?? []) {
    const row = r as { user_id: string; worked?: boolean | null };
    const worked = row.worked !== false;
    if (worked) up++;
    else down++;
    if (uid && row.user_id === uid) mine = worked ? 'up' : 'down';
  }
  return { up, down, mine };
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

// ─── Delivery Attachments ──────────────────────────────────────────────────

export async function uploadDeliveryAttachment(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    // 1. Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 2. Convert to ArrayBuffer
    const arrayBuffer = decode(base64);

    // 3. Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('delivery-attachments')
      .upload(fileName, arrayBuffer, {
        contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('delivery-attachments')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (e) {
    console.error('[servicesApi] uploadDeliveryAttachment error:', e);
    throw e;
  }
}

// ─── Deadline helpers ──────────────────────────────────────────────────────

/** Returns a human-readable deadline status string, or null if no deadline. */
export function getDeadlineStatus(s: ServicePost): { label: string; urgent: boolean } | null {
  if (!s.deadline_at) return null;
  const now = new Date();
  const deadline = new Date(s.deadline_at);
  const diff = deadline.getTime() - now.getTime();

  if (diff < 0) {
    const overdue = Math.abs(diff);
    const hours = Math.floor(overdue / (1000 * 60 * 60));
    if (hours === 0) return { label: 'Overdue by < 1h', urgent: true };
    if (hours < 24) return { label: `Overdue by ${hours}h`, urgent: true };
    return { label: `Overdue by ${Math.floor(hours / 24)}d`, urgent: true };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return { label: `Due in ${Math.floor(diff / (1000 * 60))}m`, urgent: true };
  if (hours < 24) return { label: `Due in ${hours}h`, urgent: true };
  if (hours < 48) return { label: 'Due tomorrow', urgent: false };
  return { label: `Due in ${Math.floor(hours / 24)} days`, urgent: false };
}

// ─── Service Chat ──────────────────────────────────────────────────────────

export interface ServiceMessage {
  id: string;
  service_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
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
    r.sender_name = p?.name || 'Student';
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

export async function markServiceMessagesRead(serviceId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_service_messages_read', { p_service_id: serviceId });
  if (error) {
    console.error('Failed to mark messages read', error);
  }
}

export async function fetchUnreadChatCount(serviceId: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('service_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', serviceId)
    .is('read_at', null)
    .neq('sender_id', userId);
  
  if (error) {
    console.error('fetchUnreadChatCount error:', error);
    return 0;
  }
  return count || 0;
}

// ─── Open listing 1:1 DM (author ↔ offer row) ─────────────────────────────

export interface OfferDmMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  sender_name?: string;
  sender_avatar?: string | null;
}

export async function ensureOpenOfferDmThread(offerId: string): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_open_offer_dm_thread', {
    p_offer_id: offerId,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchOfferDmMessages(threadId: string): Promise<OfferDmMessage[]> {
  const { data, error } = await supabase
    .from('service_offer_dm_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch offer DM messages', error);
    return [];
  }

  const rows = (data ?? []) as OfferDmMessage[];
  if (!rows.length) return rows;

  const senderIds = [...new Set(rows.map((r) => r.sender_id))];
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', senderIds);

  const pm = new Map((profs ?? []).map((p: any) => [p.id, p]));
  for (const r of rows) {
    const p = pm.get(r.sender_id);
    r.sender_name = p?.name || 'Student';
    r.sender_avatar = p?.avatar_url || null;
  }

  return rows;
}

export async function sendOfferDmMessage(threadId: string, content: string): Promise<OfferDmMessage | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('service_offer_dm_messages')
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      content: content.trim(),
    })
    .select()
    .single();

  if (error) throw error;

  const msg = data as OfferDmMessage;
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

export async function markOfferDmMessagesRead(threadId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_offer_dm_messages_read', { p_thread_id: threadId });
  if (error) {
    console.error('Failed to mark offer DM read', error);
  }
}
