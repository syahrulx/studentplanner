import { supabase } from './supabase';

// =============================================================================
// TYPES
// =============================================================================

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
export type LocationVisibility = 'public' | 'friends' | 'off';
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
  // Joined profile data
  profile?: FriendProfile;
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
}

export interface CircleMember {
  circle_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profile?: FriendProfile;
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

export interface FriendWithStatus extends FriendProfile {
  location?: UserLocation;
  activity?: UserActivity;
}

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
  const { data, error } = await supabase
    .from('friendships')
    .insert({ requester_id: requesterId, addressee_id: addresseeId, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
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
  return data;
}

/** Remove / unfriend */
export async function removeFriend(friendshipId: string) {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

/** Block a user */
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
  return data || [];
}

/** Suggest friends from same university/course/faculty/class */
export async function getSuggestions(
  userId: string,
  university?: string,
  course?: string,
  faculty?: string,
  classGroup?: string
): Promise<FriendProfile[]> {
  // Get IDs of people I'm already friends with or have pending requests
  const { data: existing } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  const excludeIds = new Set([userId]);
  (existing || []).forEach((f) => {
    excludeIds.add(f.requester_id);
    excludeIds.add(f.addressee_id);
  });

  let query = supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .not('id', 'in', `(${Array.from(excludeIds).join(',')})`)
    .limit(20);

  // Prioritize by matching criteria
  if (university) query = query.eq('university', university);

  const { data, error } = await query;
  if (error) throw error;

  // Sort by similarity: same class > same course > same faculty > same university
  const results = (data || []) as FriendProfile[];
  results.sort((a, b) => {
    const scoreA =
      (a.class_group === classGroup ? 8 : 0) +
      (a.course === course ? 4 : 0) +
      (a.faculty === faculty ? 2 : 0) +
      (a.university === university ? 1 : 0);
    const scoreB =
      (b.class_group === classGroup ? 8 : 0) +
      (b.course === course ? 4 : 0) +
      (b.faculty === faculty ? 2 : 0) +
      (b.university === university ? 1 : 0);
    return scoreB - scoreA;
  });

  return results;
}

/** Search users by name */
export async function searchUsers(userId: string, query: string): Promise<FriendProfile[]> {
  if (!query || query.trim().length < 2) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, university, avatar_url, bio, faculty, course, class_group')
    .neq('id', userId)
    .ilike('name', `%${query.trim()}%`)
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
    .select('circle_id')
    .eq('user_id', userId);

  if (mErr) throw mErr;
  if (!memberships || memberships.length === 0) return [];

  const circleIds = memberships.map((m) => m.circle_id);

  const { data: circles, error } = await supabase
    .from('circles')
    .select('*')
    .in('id', circleIds);

  if (error) throw error;

  // Get member counts
  const { data: allMembers } = await supabase
    .from('circle_members')
    .select('circle_id')
    .in('circle_id', circleIds);

  const countMap = new Map<string, number>();
  (allMembers || []).forEach((m) => {
    countMap.set(m.circle_id, (countMap.get(m.circle_id) || 0) + 1);
  });

  return (circles || []).map((c) => ({
    ...c,
    member_count: countMap.get(c.id) || 0,
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

/** Invite a friend to a circle */
export async function inviteToCircle(circleId: string, friendId: string) {
  const { error } = await supabase
    .from('circle_members')
    .insert({ circle_id: circleId, user_id: friendId, role: 'member' });
  if (error) throw error;
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
  const { error } = await supabase.from('user_activities').upsert({
    user_id: userId,
    activity_type: activityType,
    detail: detail || null,
    course_name: courseName || null,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Clear my activity (set to idle) */
export async function clearActivity(userId: string) {
  await updateMyActivity(userId, 'idle');
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

  return friends.map((f) => ({
    ...f,
    location: locMap.get(f.id),
    activity: actMap.get(f.id),
  }));
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

/** Generate an invite deep link for adding friends */
export function generateInviteLink(userId: string): string {
  return `gradeupmobile://add-friend?id=${userId}`;
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
