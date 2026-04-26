import { supabase } from './supabase';

// =============================================================================
// TYPES
// =============================================================================

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
export type LocationVisibility = 'public' | 'friends' | 'custom_friends' | 'circles' | 'off';
export type ActivityType =
  | 'studying'
  | 'in_class'
  | 'in_lab'
  | 'doing_assignment'
  | 'in_exam'
  | 'group_study'
  | 'revision'
  | 'listening_music'
  | 'at_library'
  | 'at_cafeteria'
  | 'exercising'
  | 'commuting'
  | 'taking_break'
  | 'in_meeting'
  | 'working_on_project'
  | 'tutoring'
  | 'at_event'
  | 'idle'
  | 'custom';

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  /** Requester profile when this row is an incoming pending request */
  profile?: FriendProfile;
  /** Addressee profile when this row is an outgoing pending request */
  addressee_profile?: FriendProfile;
}

export interface FriendProfile {
  id: string;
  name: string;
  university?: string;
  avatar_url?: string;
  bio?: string;
  faculty?: string;
  course?: string;
  class_group?: string;
}

export interface Circle {
  id: string;
  name: string;
  emoji: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  member_count?: number;
  /** Current user's role in this circle (if loaded via getMyCircles). */
  my_role?: 'admin' | 'member';
}

export interface CircleMember {
  circle_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profile?: FriendProfile;
}

export type CircleInvitationStatus = 'pending' | 'accepted' | 'rejected';

export interface CircleInvitation {
  id: string;
  circle_id: string;
  inviter_id: string;
  invitee_id: string;
  status: CircleInvitationStatus;
  created_at: string;
  circle?: Pick<Circle, 'id' | 'name' | 'emoji'>;
  inviter_profile?: FriendProfile;
}

export interface UserLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  place_name?: string;
  updated_at: string;
  visibility: LocationVisibility;
}

export interface UserActivity {
  user_id: string;
  activity_type: ActivityType;
  detail?: string;
  course_name?: string;
  is_playing?: boolean;
  song_name?: string;
  song_artist?: string;
  song_album_art?: string;
  song_track_id?: string;
  started_at: string;
  updated_at: string;
}

export interface QuickReaction {
  id: string;
  sender_id: string;
  receiver_id: string;
  reaction_type: string;
  message?: string;
  created_at: string;
  read: boolean;
  sender_profile?: FriendProfile;
}

export interface MusicPresence {
  song: string;
  artist: string;
  albumArt: string;
  isPlaying: boolean;
  trackId?: string;
}

export interface FriendWithStatus extends FriendProfile {
  location?: UserLocation;
  activity?: UserActivity;
  music?: MusicPresence;
}

function isPgrstSchemaCacheError(err: any): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      (err.code === 'PGRST002' ||
        String(err.message || '').includes('schema cache') ||
        String(err.message || '').includes('Could not query the database for the schema cache')),
  );
}

async function withPgrstRetry<T>(fn: () => Promise<{ data: T | null; error: any }>, opts?: { retries?: number }): Promise<{ data: T | null; error: any }> {
  const retries = Math.max(0, Math.min(3, opts?.retries ?? 2));
  let last: { data: T | null; error: any } = { data: null, error: null };
  for (let attempt = 0; attempt <= retries; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    last = await fn();
    if (!last.error) return last;
    if (!isPgrstSchemaCacheError(last.error)) return last;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return last;
}

function isJwtExpiredError(err: any): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = String((err as any).message || '').toLowerCase();
  const code = String((err as any).code || '');
  // PostgREST commonly returns PGRST301 for JWT issues; some deployments surface PGRST303 too.
  if (code === 'PGRST301' || code === 'PGRST303') return true;
  if (msg.includes('jwt expired')) return true;
  if (msg.includes('invalid jwt')) return true;
  if (msg.includes('jwt')) return msg.includes('expired') || msg.includes('invalid');
  return false;
}

async function refreshSessionIfPossible(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.refresh_token) return false;
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return false;
    return Boolean(data?.session?.access_token);
  } catch {
    return false;
  }
}

/**
 * Some long-lived app sessions can hit PostgREST with an expired access token before
 * Supabase-js auto-refresh catches up. Retry once after an explicit refresh.
 */
async function withAuthRetry<T>(fn: () => Promise<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> {
  const first = await fn();
  if (!first.error) return first;
  if (!isJwtExpiredError(first.error)) return first;
  const ok = await refreshSessionIfPossible();
  if (!ok) return first;
  return await fn();
}

function logCommunityQueryError(label: string, error: any): void {
  if (isPgrstSchemaCacheError(error)) {
    if (__DEV__) console.warn(`[Community] ${label} (transient, will retry on next refresh):`, error?.message || error?.code);
  } else {
    console.error(label, error);
  }
}

// -----------------------------------------------------------------------------
// Accountability Pacts (Shared Goals)
// -----------------------------------------------------------------------------
export interface SharedGoal {
  id: string;
  user_id: string;
  friend_id: string;
  local_task_id: string;
  title: string;
  share_type: 'task' | 'subject';
  course_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  // Included when joining with profiles
  creator_profile?: FriendProfile;
  friend_profile?: FriendProfile;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Activity type metadata for UI
export const ACTIVITY_TYPES: { type: ActivityType; emoji: string; label: string }[] = [
  { type: 'studying', emoji: '📚', label: 'Studying' },
  { type: 'in_class', emoji: '🏫', label: 'In Class' },
  { type: 'in_lab', emoji: '🔬', label: 'In Lab' },
  { type: 'doing_assignment', emoji: '✍️', label: 'Doing Assignment' },
  { type: 'in_exam', emoji: '📝', label: 'In Exam' },
  { type: 'group_study', emoji: '👥', label: 'Group Study' },
  { type: 'revision', emoji: '🔄', label: 'Revision' },
  { type: 'listening_music', emoji: '🎵', label: 'Listening to Music' },
  { type: 'at_library', emoji: '📖', label: 'At Library' },
  { type: 'at_cafeteria', emoji: '☕', label: 'At Cafeteria' },
  { type: 'exercising', emoji: '💪', label: 'Exercising' },
  { type: 'commuting', emoji: '🚌', label: 'Commuting' },
  { type: 'taking_break', emoji: '😴', label: 'Taking a Break' },
  { type: 'in_meeting', emoji: '🤝', label: 'In Meeting' },
  { type: 'working_on_project', emoji: '💻', label: 'Working on Project' },
  { type: 'tutoring', emoji: '🎓', label: 'Tutoring' },
  { type: 'at_event', emoji: '🎪', label: 'At Event' },
  { type: 'idle', emoji: '⏸️', label: 'Idle' },
  { type: 'custom', emoji: '✨', label: 'Custom' },
];

// Quick reaction options
export const REACTION_EMOJIS = [
  { type: '👋', label: 'Wave' },
  { type: '🔥', label: 'Fire' },
  { type: '💪', label: 'Flex' },
  { type: '📚', label: 'Study nudge' },
  { type: '❤️', label: 'Heart' },
  { type: '👍', label: 'Thumbs up' },
  { type: '🎉', label: 'Celebrate' },
];

export const REACTION_TEMPLATES = [
  "Let's study together!",
  "Good job, keep it up! 💪",
  "Take a break, you deserve it! 😴",
  "Want to grab lunch? 🍔",
  "Are you free later?",
  "Need help? I'm nearby!",
];

// =============================================================================
// FRIENDS
// =============================================================================

/** Send a friend request to another user */
export async function sendFriendRequest(requesterId: string, addresseeId: string) {
  // Check for any existing friendship row (in either direction) to avoid duplicate key errors
  const { data: existing } = await supabase
    .from('friendships')
    .select('id, status, requester_id')
    .or(
      `and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error('You are already friends with this person.');
    }
    if (existing.status === 'pending' && existing.requester_id === requesterId) {
      throw new Error('Friend request already sent.');
    }
    if (existing.status === 'pending' && existing.requester_id === addresseeId) {
      // They already sent us a request — accept it instead
      await acceptFriendRequest(existing.id);
      return existing;
    }
    if (existing.status === 'blocked') {
      throw new Error('Unable to send friend request.');
    }
  }

  const { data, error } = await supabase
    .from('friendships')
    .insert({ requester_id: requesterId, addressee_id: addresseeId, status: 'pending' })
    .select()
    .single();
  if (error) throw error;

  // Notify the addressee so the request appears in their notifications feed
  await sendReaction(requesterId, addresseeId, '👋', 'Sent you a friend request!').catch(() => {});

  return data;
}

/** Accept a friend request */
export async function acceptFriendRequest(friendshipId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .select()
    .single();
  if (error) throw error;

  // Notify the original requester that their request was accepted
  if (data?.requester_id && data?.addressee_id) {
    await sendReaction(data.addressee_id, data.requester_id, '🤝', 'Accepted your friend request!').catch(() => {});
  }

  return data;
}

/** Remove / unfriend */
export async function removeFriend(friendshipId: string) {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

/** Block a user by friendship id (legacy — requires an existing friendship row). */
export async function blockUser(friendshipId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'blocked' })
    .eq('id', friendshipId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Block another user by their user id. Works whether or not a friendship exists.
 * - If a friendship row exists between the two users, marks it `blocked`.
 * - If no friendship exists, inserts one with status `blocked` so the block is persisted
 *   on the server and respected by any query that filters out blocked users.
 * Required by Apple App Store Guideline 1.2 (UGC: mechanism for blocking abusive users).
 */
export async function blockUserByUserId(userId: string, blockedUserId: string) {
  if (!userId || !blockedUserId || userId === blockedUserId) {
    throw new Error('Invalid block target');
  }
  const { data: existing } = await supabase
    .from('friendships')
    .select('id')
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${blockedUserId}),and(requester_id.eq.${blockedUserId},addressee_id.eq.${userId})`
    )
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'blocked' })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error: insertErr } = await supabase
    .from('friendships')
    .insert({ requester_id: userId, addressee_id: blockedUserId, status: 'blocked' });
  if (insertErr) throw insertErr;
}

/** Unblock a user. Removes the friendship row (treated as "no relationship"). */
export async function unblockUserByUserId(userId: string, blockedUserId: string) {
  const { data } = await supabase
    .from('friendships')
    .select('id, status')
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${blockedUserId}),and(requester_id.eq.${blockedUserId},addressee_id.eq.${userId})`
    )
    .maybeSingle();

  if (!data?.id) return;
  if (data.status !== 'blocked') return;
  const { error } = await supabase.from('friendships').delete().eq('id', data.id);
  if (error) throw error;
}

/**
 * File a report against another user.
 * Required by Apple App Store Guideline 1.2 (UGC: mechanism for reporting objectionable
 * content or abusive users). Writes to `public.user_reports`.
 */
export async function reportUser(params: {
  reporterId: string;
  reportedUserId: string;
  reason: string;
  details?: string;
  context?: 'friend_profile' | 'reaction' | 'shared_task' | 'circle' | 'other';
  contextRef?: string;
}) {
  const {
    reporterId,
    reportedUserId,
    reason,
    details,
    context = 'friend_profile',
    contextRef,
  } = params;
  if (!reporterId || !reportedUserId || reporterId === reportedUserId) {
    throw new Error('Invalid report target');
  }
  if (!reason || !reason.trim()) throw new Error('A reason is required');

  const { error } = await supabase.from('user_reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    reason: reason.trim().slice(0, 80),
    details: details ? details.trim().slice(0, 2000) : null,
    context,
    context_ref: contextRef ?? null,
  });
  if (error) throw error;
}

/** Get all accepted friends with profile info */
export async function getFriends(userId: string): Promise<FriendProfile[]> {
  // Get friendships where I'm involved and status is accepted
  const { data: friendships, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) throw error;
  if (!friendships || friendships.length === 0) return [];

  // Extract friend IDs (the other person in each friendship)
  const friendIds = friendships.map((f) =>
    f.requester_id === userId ? f.addressee_id : f.requester_id
  );

  // Fetch their profiles
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .in('id', friendIds);

  if (pErr) throw pErr;
  return (profiles || []) as FriendProfile[];
}

/** Get pending friend requests sent TO me */
export async function getIncomingRequests(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  if (error) throw error;

  if (!data || data.length === 0) return [];

  // Fetch requester profiles
  const requesterIds = data.map((f) => f.requester_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .in('id', requesterIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  return data.map((f) => ({ ...f, profile: profileMap.get(f.requester_id) }));
}

/** Get pending friend requests sent BY me */
export async function getOutgoingRequests(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('requester_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const addresseeIds = data.map((f) => f.addressee_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .in('id', addresseeIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  return data.map((f) => ({ ...f, addressee_profile: profileMap.get(f.addressee_id) }));
}

/** Suggest friends nearby based on public location */
export async function getSuggestions(
  userId: string,
  university?: string,
  course?: string,
  faculty?: string,
  classGroup?: string
): Promise<FriendProfile[]> {
  // 1. Get IDs of people I'm already friends with or have pending requests
  const { data: existing } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  const excludeIds = new Set([userId]);
  (existing || []).forEach((f) => {
    excludeIds.add(f.requester_id);
    excludeIds.add(f.addressee_id);
  });

  // 2. Get my own location
  const { data: myLoc } = await supabase
    .from('user_locations')
    .select('latitude, longitude')
    .eq('user_id', userId)
    .single();

  if (!myLoc?.latitude || !myLoc?.longitude) {
    // If we have no location, we can't find nearby users. Return empty.
    return [];
  }

  // 3. Get all public locations
  const excludeArray = Array.from(excludeIds);
  let locQuery = supabase
    .from('user_locations')
    .select('user_id, latitude, longitude')
    .eq('visibility', 'public');
  
  if (excludeArray.length > 0) {
    locQuery = locQuery.not('user_id', 'in', `(${excludeArray.join(',')})`);
  }

  const { data: publicLocs, error: locError } = await locQuery;
  if (locError) throw locError;

  if (!publicLocs || publicLocs.length === 0) {
    return [];
  }

  // 4. Calculate Haversine distance
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371; // Earth's radius in km

  const withDistances = publicLocs.map((loc) => {
    const dLat = toRad(loc.latitude - myLoc.latitude);
    const dLon = toRad(loc.longitude - myLoc.longitude);
    const lat1 = toRad(myLoc.latitude);
    const lat2 = toRad(loc.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return { user_id: loc.user_id, distance };
  });

  // 5. Sort by distance, take top 20
  withDistances.sort((a, b) => a.distance - b.distance);
  const topNearbyIds = withDistances.slice(0, 20).map((d) => d.user_id);

  if (topNearbyIds.length === 0) return [];

  // 6. Fetch profiles for these top nearby users
  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .in('id', topNearbyIds);

  if (profError) throw profError;

  // Re-sort profiles to match the distance ranking
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  const results = topNearbyIds
    .map((id) => profileMap.get(id))
    .filter(Boolean) as FriendProfile[];

  return results;
}

/** Search users by name */
export async function searchUsers(userId: string, query: string): Promise<FriendProfile[]> {
  if (!query || query.trim().length < 2) return [];

  // SECURITY: Escape SQL LIKE wildcards to prevent pattern injection
  // (e.g., searching "%" would match all users without this)
  const escapedQuery = query.trim().replace(/[%_\\]/g, '\\$&');

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .neq('id', userId)
    .ilike('name', `%${escapedQuery}%`)
    .limit(20);

  if (error) throw error;
  return (data || []) as FriendProfile[];
}

// =============================================================================
// CIRCLES
// =============================================================================

/** Create a new circle */
export async function createCircle(userId: string, name: string, emoji: string = '👥'): Promise<Circle> {
  const { data, error } = await supabase
    .from('circles')
    .insert({ name, emoji, created_by: userId })
    .select()
    .single();
  if (error) throw error;

  // Add creator as admin member
  await supabase.from('circle_members').insert({
    circle_id: data.id,
    user_id: userId,
    role: 'admin',
  });

  return data;
}

/** Get my circles with member counts */
export async function getMyCircles(userId: string): Promise<Circle[]> {
  const { data: memberships, error: mErr } = await supabase
    .from('circle_members')
    .select('circle_id,role')
    .eq('user_id', userId);

  if (mErr) throw mErr;
  if (!memberships || memberships.length === 0) return [];

  const circleIds = memberships.map((m) => m.circle_id);
  const myRoleByCircleId = new Map<string, 'admin' | 'member'>(
    memberships.map((m) => [m.circle_id as string, (m as { role: 'admin' | 'member' }).role]),
  );

  const { data: circles, error } = await supabase
    .from('circles')
    .select('*')
    .in('id', circleIds);

  if (error) throw error;

  // Get member counts efficiently — head-only queries return zero row data
  const countResults = await Promise.all(
    circleIds.map((cid) =>
      supabase
        .from('circle_members')
        .select('*', { count: 'exact', head: true })
        .eq('circle_id', cid)
        .then(({ count }) => [cid, count || 0] as const)
    )
  );
  const countMap = new Map<string, number>(countResults);

  return (circles || []).map((c) => ({
    ...c,
    member_count: countMap.get(c.id) || 0,
    my_role: myRoleByCircleId.get(c.id) || 'member',
  }));
}

/** Get members of a circle with profiles */
export async function getCircleMembers(circleId: string): Promise<CircleMember[]> {
  const { data: members, error } = await supabase
    .from('circle_members')
    .select('*')
    .eq('circle_id', circleId);

  if (error) throw error;
  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  return members.map((m) => ({ ...m, profile: profileMap.get(m.user_id) }));
}

/** Join a circle by invite code */
export async function joinCircleByCode(userId: string, inviteCode: string): Promise<Circle | null> {
  const { data: circle, error } = await supabase
    .from('circles')
    .select('*')
    .eq('invite_code', inviteCode)
    .single();

  if (error || !circle) return null;

  // Check if already a member
  const { data: existing } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('circle_id', circle.id)
    .eq('user_id', userId)
    .single();

  if (!existing) {
    await supabase.from('circle_members').insert({
      circle_id: circle.id,
      user_id: userId,
      role: 'member',
    });
  }

  return circle;
}

/** Leave a circle */
export async function leaveCircle(circleId: string, userId: string) {
  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function removeCircleMember(circleId: string, memberId: string) {
  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', memberId);
  if (error) throw error;
}

export async function deleteCircle(circleId: string) {
  const { error } = await supabase.from('circles').delete().eq('id', circleId);
  if (error) throw error;
}

/** Invite a friend to a circle */
export async function inviteToCircle(circleId: string, inviterId: string, friendId: string) {
  // Unique constraint is (circle_id, invitee_id). Make this idempotent:
  //   1. Try a plain INSERT (the happy path for new invitees).
  //   2. If a row already exists, fall back to a targeted UPDATE that resets
  //      the existing invitation back to "pending" (re-invite after reject).
  //      This avoids relying on upsert's conversion to UPDATE, which in turn
  //      avoids a RLS trap where some environments didn't yet have the admin
  //      UPDATE policy applied (migration 057).
  const insertRes = await supabase
    .from('circle_invitations')
    .insert({
      circle_id: circleId,
      inviter_id: inviterId,
      invitee_id: friendId,
      status: 'pending',
    });

  if (!insertRes.error) return;

  const msg = insertRes.error.message || '';
  const isDuplicate = /duplicate key|unique constraint|already exists/i.test(msg);
  if (!isDuplicate) throw insertRes.error;

  const updateRes = await supabase
    .from('circle_invitations')
    .update({ status: 'pending', inviter_id: inviterId })
    .eq('circle_id', circleId)
    .eq('invitee_id', friendId);

  if (updateRes.error) throw updateRes.error;
}

export async function getMyCircleInvitations(userId: string): Promise<CircleInvitation[]> {
  const { data, error } = await supabase
    .from('circle_invitations')
    .select('id,circle_id,inviter_id,invitee_id,status,created_at')
    .eq('invitee_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const invites = (data ?? []) as CircleInvitation[];
  if (!invites.length) return [];

  const circleIds = Array.from(new Set(invites.map((i) => i.circle_id)));
  const inviterIds = Array.from(new Set(invites.map((i) => i.inviter_id)));

  const [{ data: circles, error: ce }, { data: profs, error: pe }] = await Promise.all([
    supabase.from('circles').select('id,name,emoji').in('id', circleIds),
    supabase.from('profiles').select('id,name,university,avatar_url,bio,faculty,course,class_group').in('id', inviterIds),
  ]);
  if (ce) throw ce;
  if (pe) throw pe;

  const circleMap = new Map((circles ?? []).map((c: any) => [c.id, c]));
  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));

  return invites.map((i) => ({
    ...i,
    circle: circleMap.get(i.circle_id) ?? undefined,
    inviter_profile: profMap.get(i.inviter_id) ?? undefined,
  }));
}

export async function respondToCircleInvitation(inviteId: string, accept: boolean) {
  // Load invite first (RLS: invitee can read their own invites)
  const { data: inv, error: ie } = await supabase
    .from('circle_invitations')
    .select('id,circle_id,invitee_id,status')
    .eq('id', inviteId)
    .single();
  if (ie) throw ie;
  if (!inv) throw new Error('Invitation not found');
  if (inv.status !== 'pending') return;

  const status: CircleInvitationStatus = accept ? 'accepted' : 'rejected';
  const { error: ue } = await supabase.from('circle_invitations').update({ status }).eq('id', inviteId);
  if (ue) throw ue;

  if (accept) {
    // Join circle (self insert is allowed by circle_members RLS)
    const { error: je } = await supabase
      .from('circle_members')
      .insert({ circle_id: inv.circle_id, user_id: inv.invitee_id, role: 'member' });
    // Ignore "already a member" errors (PK conflict)
    if (je && !/duplicate key value|already exists/i.test(je.message)) throw je;
  }
}

// =============================================================================
// LOCATION
// =============================================================================

/** Update my location (upsert) */
export async function updateMyLocation(
  userId: string,
  latitude: number,
  longitude: number,
  placeName?: string,
  visibility: LocationVisibility = 'friends'
) {
  const { error } = await supabase.from('user_locations').upsert({
    user_id: userId,
    latitude,
    longitude,
    place_name: placeName || null,
    updated_at: new Date().toISOString(),
    visibility,
  });
  if (error) throw error;
}

/** Get locations of all friends */
export async function getFriendsLocations(userId: string): Promise<UserLocation[]> {
  const friends = await getFriends(userId);
  if (friends.length === 0) return [];

  const friendIds = friends.map((f) => f.id);

  const { data, error } = await supabase
    .from('user_locations')
    .select('*')
    .in('user_id', friendIds)
    .neq('visibility', 'off');

  if (error) throw error;
  return (data || []) as UserLocation[];
}

/** Get my own location from DB */
export async function getMyLocation(userId: string): Promise<UserLocation | null> {
  const { data, error } = await supabase
    .from('user_locations')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data as UserLocation;
}

// =============================================================================
// ACTIVITY
// =============================================================================

/** Update my activity status */
export async function updateMyActivity(
  userId: string,
  activityType: ActivityType,
  detail?: string,
  courseName?: string
) {
  // Fetch current activity to preserve music fields
  const { data: currentAct } = await supabase
    .from('user_activities')
    .select('is_playing, song_name, song_artist, song_album_art, song_track_id')
    .eq('user_id', userId)
    .maybeSingle();

  const { error } = await supabase.from('user_activities').upsert({
    user_id: userId,
    activity_type: activityType,
    detail: detail || null,
    course_name: courseName || null,
    is_playing: currentAct?.is_playing || false,
    song_name: currentAct?.song_name || null,
    song_artist: currentAct?.song_artist || null,
    song_album_art: currentAct?.song_album_art || null,
    song_track_id: currentAct?.song_track_id || null,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Clear my activity (set to idle) and also clear any music vibe. */
export async function clearActivity(userId: string) {
  const { error } = await supabase.from('user_activities').upsert({
    user_id: userId,
    activity_type: 'idle' as ActivityType,
    detail: null,
    course_name: null,
    is_playing: false,
    song_name: null,
    song_artist: null,
    song_album_art: null,
    song_track_id: null,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Get my own activity */
export async function getMyActivity(userId: string): Promise<UserActivity | null> {
  const { data, error } = await supabase
    .from('user_activities')
    .select('*')
    .eq('user_id', userId)
    .single();
    
  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }
  return data as UserActivity;
}

/** Get activities of all friends */
export async function getFriendsActivities(userId: string): Promise<UserActivity[]> {
  const friends = await getFriends(userId);
  if (friends.length === 0) return [];

  const friendIds = friends.map((f) => f.id);

  const { data, error } = await supabase
    .from('user_activities')
    .select('*')
    .in('user_id', friendIds);

  if (error) throw error;
  return (data || []) as UserActivity[];
}

/** Get all friends with their location + activity data in one shot */
export async function getFriendsWithStatus(userId: string): Promise<FriendWithStatus[]> {
  const friends = await getFriends(userId);
  if (friends.length === 0) return [];

  const friendIds = friends.map((f) => f.id);

  const [locResult, actResult] = await Promise.all([
    supabase.from('user_locations').select('*').in('user_id', friendIds).neq('visibility', 'off'),
    supabase.from('user_activities').select('*').in('user_id', friendIds),
  ]);

  const locMap = new Map((locResult.data || []).map((l: any) => [l.user_id, l]));
  const actMap = new Map((actResult.data || []).map((a: any) => [a.user_id, a]));

  return friends.map((f) => {
    const act = actMap.get(f.id) as any;
    const music: MusicPresence | undefined =
      act?.is_playing
        ? { song: act.song_name || '', artist: act.song_artist || '', albumArt: act.song_album_art || '', isPlaying: true, trackId: act.song_track_id || '' }
        : undefined;
    return {
      ...f,
      location: locMap.get(f.id),
      activity: actMap.get(f.id),
      music,
    };
  });
}

// =============================================================================
// REACTIONS
// =============================================================================

/** Send a reaction to a friend */
export async function sendReaction(
  senderId: string,
  receiverId: string,
  reactionType: string,
  message?: string
) {
  const { data, error } = await supabase
    .from('quick_reactions')
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      reaction_type: reactionType,
      message: message || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Get my received reactions (newest first) */
export async function getMyReactions(userId: string): Promise<QuickReaction[]> {
  const { data, error } = await supabase
    .from('quick_reactions')
    .select('*')
    .eq('receiver_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Fetch sender profiles
  const senderIds = [...new Set(data.map((r) => r.sender_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url')
    .in('id', senderIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  return data.map((r) => ({ ...r, sender_profile: profileMap.get(r.sender_id) }));
}

/** Get count of unread reactions */
export async function getUnreadReactionCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('quick_reactions')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .eq('read', false);

  if (error) return 0;
  return count || 0;
}

/** Mark all reactions as read */
export async function markReactionsRead(userId: string) {
  const { error } = await supabase
    .from('quick_reactions')
    .update({ read: true })
    .eq('receiver_id', userId)
    .eq('read', false);
  if (error) throw error;
}

/** Delete all received reaction rows (notification history) for the current user. */
export async function clearMyReceivedReactions(userId: string): Promise<void> {
  const { error } = await supabase.from('quick_reactions').delete().eq('receiver_id', userId);
  if (error) throw error;
}

/** Delete a specific set of received reaction rows for the current user (multi-select clear). */
export async function deleteMyReceivedReactions(userId: string, ids: string[]): Promise<void> {
  const list = Array.from(new Set((ids ?? []).filter((v) => typeof v === 'string' && v.trim().length > 0)));
  if (list.length === 0) return;
  const { error } = await supabase
    .from('quick_reactions')
    .delete()
    .eq('receiver_id', userId)
    .in('id', list);
  if (error) throw error;
}

/** Send a bump (special reaction that triggers push notification) */
export async function sendBump(senderId: string, receiverId: string) {
  return sendReaction(senderId, receiverId, 'bump', '💥 Bump!');
}

// =============================================================================
// ADDITIONAL UTILITIES
// =============================================================================

/** Get a single user's profile */
export async function getUserProfile(userId: string): Promise<FriendProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data as FriendProfile;
}

/** Remove friend by looking up the friendship between two users */
export async function removeFriendByUserId(userId: string, friendId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id')
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`
    )
    .single();

  if (error || !data) throw new Error('Friendship not found');
  await removeFriend(data.id);
}

/**
 * Public invite URL (HTTPS) so apps like WhatsApp linkify a tappable link.
 * Requires hosting `aizztech.com` files (AASA, landing page) — see
 * `legal/aizztech-website/README.md`. Universal Links / App Links open the app
 * when installed; otherwise the web page tries `rencana://` and store links.
 */
const INVITE_HTTP_BASE =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_INVITE_HTTP_BASE) || 'https://aizztech.com';

/** Generate a shareable invite link (https — not custom scheme) */
export function generateInviteLink(userId: string): string {
  const id = encodeURIComponent(userId);
  const base = String(INVITE_HTTP_BASE).replace(/\/$/, '');
  return `${base}/community/add-friend?id=${id}`;
}

/** Get list of user IDs in a circle (for map filtering) */
export async function getCircleMemberIds(circleId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circleId);

  if (error) throw error;
  return (data || []).map((m) => m.user_id);
}

/** Update user's location visibility setting */
export async function updateLocationVisibility(userId: string, visibility: LocationVisibility) {
  // Update in user_locations table
  const { error: locErr } = await supabase
    .from('user_locations')
    .update({ visibility })
    .eq('user_id', userId);

  // Also update in profiles table
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ location_visibility: visibility })
    .eq('id', userId);

  if (locErr) console.warn('Failed to update location visibility:', locErr);
  if (profErr) console.warn('Failed to update profile visibility:', profErr);
}

/** Get only the user's location visibility from their profile */
export async function getLocationVisibilityFromProfile(userId: string): Promise<LocationVisibility> {
  const { data, error } = await supabase
    .from('profiles')
    .select('location_visibility')
    .eq('id', userId)
    .single();

  if (error || !data) return 'friends';
  return (data.location_visibility as LocationVisibility) || 'friends';
}

/** Get list of friend IDs that are allowed to see the user's location when visibility = 'custom_friends'. */
export async function getCustomFriendLocationVisibility(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('friend_location_visibility')
    .select('friend_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: { friend_id: string }) => r.friend_id);
}

/** Replace the user's friend location allowlist with a new set of friend IDs. */
export async function setCustomFriendLocationVisibility(userId: string, friendIds: string[]): Promise<void> {
  const { error: delErr } = await supabase
    .from('friend_location_visibility')
    .delete()
    .eq('user_id', userId);
  if (delErr) throw delErr;

  if (!friendIds.length) return;

  const rows = friendIds.map((fId) => ({ user_id: userId, friend_id: fId }));
  const { error } = await supabase.from('friend_location_visibility').insert(rows);
  if (error) throw error;
}

/** Get list of circle IDs that are allowed to see the user's location when visibility = 'circles'. */
export async function getCircleLocationVisibility(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('circle_location_visibility')
    .select('circle_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: { circle_id: string }) => r.circle_id);
}

/** Replace the user's circle location allowlist with a new set of circle IDs. */
export async function setCircleLocationVisibility(userId: string, circleIds: string[]): Promise<void> {
  // Clear existing rows, then insert the new allowlist.
  const { error: delErr } = await supabase
    .from('circle_location_visibility')
    .delete()
    .eq('user_id', userId);
  if (delErr) throw delErr;

  if (!circleIds.length) return;

  const rows = circleIds.map((circleId) => ({ user_id: userId, circle_id: circleId }));
  const { error } = await supabase.from('circle_location_visibility').insert(rows);
  if (error) throw error;
}

// =============================================================================
// STORAGE / AVATAR UPLOAD
// =============================================================================

import { decode } from 'base64-arraybuffer';

/**
 * Upload an avatar image base64 string to Supabase Storage
 * and update the user's profile with the new public URL.
 */
export async function uploadAvatar(base64Image: string, ext: string = 'jpeg'): Promise<string> {
  // Always fetch the true UUID from auth to avoid 22P02 errors
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error('Not authenticated');
  const userId = user.id;

  const fileName = `${userId}_${Date.now()}.${ext}`;
  const filePath = `avatars/${fileName}`;

  // 1. Upload to Supabase Storage (avatars bucket)
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, decode(base64Image), {
      contentType: `image/${ext}`,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  // 2. Get Public URL
  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  const publicUrl = publicUrlData.publicUrl;

  // 3. Update profiles table
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateError) throw updateError;

  return publicUrl;
}

// =============================================================================
// SHARED GOALS (Accountability Pacts)
// =============================================================================

export async function fetchSharedGoals(): Promise<SharedGoal[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const { data, error } = await withPgrstRetry(async () =>
    supabase
      .from('shared_goals')
      .select(`
      *,
      creator_profile:profiles!shared_goals_user_id_fkey(id, name, avatar_url),
      friend_profile:profiles!shared_goals_friend_id_fkey(id, name, avatar_url)
    `)
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .order('updated_at', { ascending: false }),
  );

  if (error) {
    logCommunityQueryError('Error fetching shared goals:', error);
    return [];
  }
  return data as SharedGoal[];
}

export async function createSharedGoal(params: {
  friendId: string;
  localTaskId: string;
  title: string;
  shareType: 'task' | 'subject';
  courseId: string;
}): Promise<SharedGoal | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from('shared_goals')
    .insert([{
      user_id: user.id,
      friend_id: params.friendId,
      local_task_id: params.localTaskId,
      title: params.title,
      share_type: params.shareType,
      course_id: params.courseId,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating shared goal:', error);
    return null;
  }
  
  // Send a quick reaction as a notification
  await sendReaction(
    user.id,
    params.friendId,
    params.shareType === 'task' ? '🤝' : '📚',
    `I pledged to complete ${params.shareType === 'task' ? 'a task' : 'my tasks'} for ${params.courseId}. Hold me accountable!`
  );

  return data as SharedGoal;
}

export async function updateSharedGoalStatus(id: string, updates: Partial<Pick<SharedGoal, 'status' | 'is_completed'>>): Promise<void> {
  const { error } = await supabase
    .from('shared_goals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error updating shared goal:', error);
  }
}

export async function deleteSharedGoal(id: string): Promise<void> {
  const { error } = await supabase
    .from('shared_goals')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting shared goal:', error);
  }
}

// =============================================================================
// SHARED TASKS (Linked Task Sharing)
// =============================================================================

import type { SharedTask, TaskShareStream } from '../types';

/** Shared helper: convert raw `tasks` rows into a Map<task_id, Task> for shared-task enrichment. */
function buildTaskMapFromRows(rows: any[]): Map<string, any> {
  return new Map(
    rows.map((t: any) => [
      t.id,
      {
        id: t.id,
        title: t.title,
        courseId: t.course_id,
        type: t.type,
        dueDate: t.needs_date ? new Date().toISOString().slice(0, 10) : (t.due_date || ''),
        dueTime: t.due_time || '',
        notes: t.notes || '',
        isDone: Boolean(t.is_done),
        deadlineRisk: t.deadline_risk || 'Medium',
        suggestedWeek: Number(t.suggested_week || 0),
        needsDate: Boolean(t.needs_date),
        sourceMessage: t.source_message ?? undefined,
      },
    ])
  );
}

export async function shareTaskWithFriend(
  taskId: string,
  friendId: string,
  message?: string
): Promise<SharedTask | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;

  // Guard: skip if already shared (non-declined) to prevent duplicates
  const { data: existing } = await supabase
    .from('shared_tasks')
    .select('id')
    .eq('task_id', taskId)
    .eq('owner_id', user.id)
    .eq('recipient_id', friendId)
    .neq('status', 'declined')
    .limit(1);

  if (existing && existing.length > 0) return null; // already shared

  const { data, error } = await supabase
    .from('shared_tasks')
    .insert({
      task_id: taskId,
      owner_id: user.id,
      recipient_id: friendId,
      circle_id: null,
      status: 'pending',
      recipient_completed: false,
      message: message || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error sharing task with friend:', error);
    return null;
  }

  await sendReaction(
    user.id,
    friendId,
    '📋',
    `Shared a task with you!`
  ).catch(() => {});

  return data as SharedTask;
}

export async function shareTaskWithCircle(
  taskId: string,
  circleId: string,
  message?: string
): Promise<SharedTask[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const memberIds = await getCircleMemberIds(circleId);
  const recipientIds = memberIds.filter(id => id !== user.id);

  if (recipientIds.length === 0) return [];

  const rows = recipientIds.map(recipientId => ({
    task_id: taskId,
    owner_id: user.id,
    recipient_id: recipientId,
    circle_id: circleId,
    status: 'pending',
    recipient_completed: false,
    message: message || null,
  }));

  const { data, error } = await supabase
    .from('shared_tasks')
    .insert(rows)
    .select();

  if (error) {
    console.error('Error sharing task with circle:', error);
    return [];
  }

  return (data || []) as SharedTask[];
}

export async function getIncomingSharedTasks(): Promise<SharedTask[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const { data, error } = await withAuthRetry(() =>
    withPgrstRetry(async () =>
      supabase
        .from('shared_tasks')
        .select('*')
        .eq('recipient_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ),
  );

  if (error) {
    logCommunityQueryError('Error fetching incoming shared tasks:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  const ownerIds = [...new Set(data.map(s => s.owner_id))];
  const taskIds = [...new Set(data.map(s => s.task_id))];

  const [profilesRes, tasksRes] = await Promise.all([
    withAuthRetry(() => supabase.from('profiles').select('id, name, avatar_url').in('id', ownerIds)),
    withAuthRetry(() => supabase.from('tasks').select('*').in('id', taskIds)),
  ]);

  const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const taskMap = buildTaskMapFromRows(tasksRes.data || []);

  return data.map(s => ({
    ...s,
    owner_profile: profileMap.get(s.owner_id),
    task: taskMap.get(s.task_id),
  })) as SharedTask[];
}

export async function getAcceptedSharedTasks(): Promise<SharedTask[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const { data, error } = await withAuthRetry(() =>
    withPgrstRetry(async () =>
      supabase
        .from('shared_tasks')
        .select('*')
        .eq('status', 'accepted')
        .or(`recipient_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order('created_at', { ascending: false }),
    ),
  );

  if (error) {
    logCommunityQueryError('Error fetching accepted shared tasks:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  const allUserIds = [...new Set(data.flatMap(s => [s.owner_id, s.recipient_id].filter(Boolean)))];
  const taskIds = [...new Set(data.map(s => s.task_id))];

  const [profilesRes, tasksRes] = await Promise.all([
    withAuthRetry(() => supabase.from('profiles').select('id, name, avatar_url').in('id', allUserIds)),
    withAuthRetry(() => supabase.from('tasks').select('*').in('id', taskIds)),
  ]);

  const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const taskMap = buildTaskMapFromRows(tasksRes.data || []);

  return data.map(s => ({
    ...s,
    owner_profile: profileMap.get(s.owner_id),
    recipient_profile: s.recipient_id ? profileMap.get(s.recipient_id) : undefined,
    task: taskMap.get(s.task_id),
  })) as SharedTask[];
}

export async function respondToSharedTask(
  sharedTaskId: string,
  accept: boolean
): Promise<void> {
  const { error } = await supabase
    .from('shared_tasks')
    .update({ status: accept ? 'accepted' : 'declined', updated_at: new Date().toISOString() })
    .eq('id', sharedTaskId);

  if (error) console.error('Error responding to shared task:', error);
}

export async function updateSharedTaskCompletion(
  sharedTaskId: string,
  completed: boolean
): Promise<void> {
  const { error } = await supabase
    .from('shared_tasks')
    .update({ recipient_completed: completed, updated_at: new Date().toISOString() })
    .eq('id', sharedTaskId);

  if (error) {
    console.error('Error updating shared task completion:', error);
    throw new Error(error.message || 'Could not update shared task');
  }
}

/** Remove this shared_tasks row for the current user only (recipient or owner). Does not delete tasks. */
export async function deleteSharedTaskLinkForCurrentUser(
  sharedTaskId: string
): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { error: 'Not signed in' };

  // .select() after delete returns removed rows. RLS can block delete with **no error** and 0 rows — that caused tasks to reappear after refreshSharedTasks().
  const { data, error } = await supabase.from('shared_tasks').delete().eq('id', sharedTaskId).select('id');

  if (error) {
    console.error('Error deleting shared task link:', error);
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return {
      error:
        'Could not remove this share (nothing was deleted). In Supabase SQL Editor, run the policy from gradeup-mobile/supabase/migrations/007_shared_tasks_delete_rls.sql so DELETE is allowed for owner and recipient.',
    };
  }
  return { error: null };
}

export async function getSharedTaskParticipants(taskId: string): Promise<SharedTask[]> {
  const { data, error } = await supabase
    .from('shared_tasks')
    .select('*')
    .eq('task_id', taskId)
    .neq('status', 'declined');

  if (error) {
    console.error('Error fetching shared task participants:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  const allUserIds = [...new Set(data.flatMap(s => [s.owner_id, s.recipient_id].filter(Boolean)))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', allUserIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  return data.map(s => ({
    ...s,
    owner_profile: profileMap.get(s.owner_id),
    recipient_profile: s.recipient_id ? profileMap.get(s.recipient_id) : undefined,
  })) as SharedTask[];
}

export async function getSharedTasksBetweenUsers(friendId: string): Promise<SharedTask[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const { data, error } = await supabase
    .from('shared_tasks')
    .select('*')
    .eq('status', 'accepted')
    .or(
      `and(owner_id.eq.${user.id},recipient_id.eq.${friendId}),and(owner_id.eq.${friendId},recipient_id.eq.${user.id})`
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching shared tasks between users:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  const taskIds = [...new Set(data.map(s => s.task_id))];
  const ownerIds = [...new Set(data.map(s => s.owner_id))];

  const [tasksRes, profilesRes] = await Promise.all([
    supabase.from('tasks').select('*').in('id', taskIds),
    supabase.from('profiles').select('id, name, avatar_url').in('id', ownerIds),
  ]);

  if (tasksRes.error) {
    console.warn('[Community] Could not fetch task details for shared tasks:', tasksRes.error.message);
  }

  const taskMap = buildTaskMapFromRows(tasksRes.data || []);
  const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

  return data.map(s => ({
    ...s,
    task: taskMap.get(s.task_id),
    owner_profile: profileMap.get(s.owner_id),
  })) as SharedTask[];
}

export async function shareAllTasksWithFriend(
  taskIds: string[],
  friendId: string,
  message?: string
): Promise<SharedTask[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || taskIds.length === 0) return [];

  // Filter out tasks already shared with this friend
  const { data: existing } = await supabase
    .from('shared_tasks')
    .select('task_id')
    .eq('owner_id', user.id)
    .eq('recipient_id', friendId)
    .in('task_id', taskIds)
    .neq('status', 'declined');

  const alreadyShared = new Set((existing || []).map(e => e.task_id));
  const newTaskIds = taskIds.filter(id => !alreadyShared.has(id));
  if (newTaskIds.length === 0) return [];

  const rows = newTaskIds.map(taskId => ({
    task_id: taskId,
    owner_id: user.id,
    recipient_id: friendId,
    circle_id: null,
    status: 'pending',
    recipient_completed: false,
    message: message || null,
  }));

  const { data, error } = await supabase
    .from('shared_tasks')
    .insert(rows)
    .select();

  if (error) {
    console.error('Error bulk sharing tasks with friend:', error);
    return [];
  }

  await sendReaction(
    user.id,
    friendId,
    '📋',
    `Shared ${newTaskIds.length} task${newTaskIds.length > 1 ? 's' : ''} with you!`
  ).catch(() => {});

  return (data || []) as SharedTask[];
}

export async function shareAllTasksWithCircle(
  taskIds: string[],
  circleId: string,
  message?: string
): Promise<SharedTask[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || taskIds.length === 0) return [];

  const memberIds = await getCircleMemberIds(circleId);
  const recipientIds = memberIds.filter(id => id !== user.id);
  if (recipientIds.length === 0) return [];

  // Filter out already-shared combinations
  const { data: existing } = await supabase
    .from('shared_tasks')
    .select('task_id, recipient_id')
    .eq('owner_id', user.id)
    .eq('circle_id', circleId)
    .in('task_id', taskIds)
    .neq('status', 'declined');

  const alreadySharedKeys = new Set(
    (existing || []).map(e => `${e.task_id}:${e.recipient_id}`)
  );

  const rows: any[] = [];
  for (const taskId of taskIds) {
    for (const recipientId of recipientIds) {
      if (!alreadySharedKeys.has(`${taskId}:${recipientId}`)) {
        rows.push({
          task_id: taskId,
          owner_id: user.id,
          recipient_id: recipientId,
          circle_id: circleId,
          status: 'pending',
          recipient_completed: false,
          message: message || null,
        });
      }
    }
  }

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('shared_tasks')
    .insert(rows)
    .select();

  if (error) {
    console.error('Error bulk sharing tasks with circle:', error);
    return [];
  }

  return (data || []) as SharedTask[];
}

export async function getTaskShareStreams(): Promise<TaskShareStream[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const { data, error } = await supabase
    .from('task_share_streams')
    .select('*')
    .eq('owner_id', user.id);

  if (error) {
    console.error('Error fetching task share streams:', error);
    return [];
  }

  return (data || []) as TaskShareStream[];
}

export async function setTaskShareStreamEnabled(recipientId: string, enabled: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;

  const { error } = await supabase
    .from('task_share_streams')
    .upsert(
      {
        owner_id: user.id,
        recipient_id: recipientId,
        circle_id: null,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,recipient_id' }
    );

  if (error) {
    console.error('Error setting task share stream:', error);
    throw error;
  }
}

export async function setCircleShareStreamEnabled(circleId: string, enabled: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;

  const { error } = await supabase
    .from('task_share_streams')
    .upsert(
      {
        owner_id: user.id,
        recipient_id: null,
        circle_id: circleId,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,circle_id' }
    );

  if (error) {
    console.error('Error setting circle share stream:', error);
    throw error;
  }
}

export async function syncNewTaskToStreams(taskId: string, knownUserId?: string): Promise<void> {
  let uid = knownUserId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return;

  // Find all enabled streams (friend + circle) for this user
  const { data: streams, error: streamsErr } = await supabase
    .from('task_share_streams')
    .select('recipient_id, circle_id')
    .eq('owner_id', uid)
    .eq('enabled', true);

  if (streamsErr) {
    console.error('Error fetching enabled task share streams:', streamsErr);
    return;
  }

  if (!streams || streams.length === 0) return;

  // Collect all recipient IDs: direct friends + circle members
  const directRecipients = streams
    .filter(s => s.recipient_id && !s.circle_id)
    .map(s => s.recipient_id!);

  const circleIds = streams
    .filter(s => s.circle_id)
    .map(s => s.circle_id!);

  // Resolve circle members
  let circleRecipients: string[] = [];
  if (circleIds.length > 0) {
    const { data: members } = await supabase
      .from('circle_members')
      .select('user_id')
      .in('circle_id', circleIds);
    circleRecipients = (members || [])
      .map(m => m.user_id)
      .filter(id => id !== uid); // Exclude self
  }

  // Merge and deduplicate
  const allRecipientIds = [...new Set([...directRecipients, ...circleRecipients])];
  if (allRecipientIds.length === 0) return;

  // Check which recipients already got this task
  const { data: existing } = await supabase
    .from('shared_tasks')
    .select('recipient_id')
    .eq('owner_id', uid)
    .eq('task_id', taskId)
    .in('recipient_id', allRecipientIds)
    .neq('status', 'declined');

  const alreadyShared = new Set((existing || []).map(e => e.recipient_id));
  const newRecipientIds = allRecipientIds.filter(id => !alreadyShared.has(id));

  if (newRecipientIds.length === 0) return;

  // Insert pending shared_tasks
  const rows = newRecipientIds.map(rid => ({
    task_id: taskId,
    owner_id: uid,
    recipient_id: rid,
    circle_id: null,
    status: 'pending',
    recipient_completed: false,
    message: null,
  }));

  const { data, error } = await supabase
    .from('shared_tasks')
    .insert(rows)
    .select();

  if (error) {
    console.error('Error auto-syncing new task to streams:', error);
    return;
  }

  // Fire notifications for each new recipient
  const newShares = (data || []) as SharedTask[];
  const notificationPromises = newShares.map(share => {
    if (share.recipient_id) {
      return sendReaction(
        uid!,
        share.recipient_id,
        '📋',
        `Pushed a new task to you automatically.`
      ).catch(() => {});
    }
  });

  await Promise.all(notificationPromises);
}
