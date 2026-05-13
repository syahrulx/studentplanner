/**
 * Study Snap — Data Access Layer
 *
 * All CRUD operations for the daily photo check-in feature.
 * Uses the same Supabase client and upload patterns as eventsApi.ts.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { StudySnap, SnapStreak, SnapReaction, SubscriptionPlan } from '../types';
import { maxStreakRevivals } from './flashcardGenerationLimits';

const SNAPS_BUCKET = 'study-snaps';
const VIEW_COUNT_KEY_PREFIX = 'snap_views_';

// =============================================================================
// Helpers
// =============================================================================

function rowToSnap(row: Record<string, unknown>): StudySnap {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    imageUrl: String(row.image_url),
    caption: row.caption ? String(row.caption) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
}

function rowToStreak(row: Record<string, unknown>): SnapStreak {
  return {
    currentStreak: Number(row.current_streak) || 0,
    longestStreak: Number(row.longest_streak) || 0,
    lastSnapDate: row.last_snap_date ? String(row.last_snap_date) : null,
    revivalsUsed: Number(row.revivals_used) || 0,
    revivalMonth: Number(row.revival_month) || 0,
  };
}

function rowToReaction(row: Record<string, unknown>): SnapReaction {
  return {
    id: String(row.id),
    snapId: String(row.snap_id),
    userId: String(row.user_id),
    emoji: String(row.emoji),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

/** Get today's date as YYYY-MM-DD in local timezone. */
function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get yesterday's date as YYYY-MM-DD in local timezone. */
function yesterdayDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Current month as YYYYMM integer. */
function currentYYYYMM(): number {
  const d = new Date();
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

// =============================================================================
// Image Upload
// =============================================================================

/**
 * Upload a snap photo to Supabase Storage and return the public URL.
 * Same pattern as eventsApi.uploadPostImage.
 */
export async function uploadSnapImage(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const fileName = `${user.id}/${Date.now()}.jpg`;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const arrayBuffer = decode(base64);

  const { error } = await supabase.storage
    .from(SNAPS_BUCKET)
    .upload(fileName, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from(SNAPS_BUCKET)
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// =============================================================================
// Snap CRUD
// =============================================================================

/** Post a new snap and update the streak. */
export async function postSnap(
  userId: string,
  imageUrl: string,
  caption?: string,
): Promise<StudySnap> {
  // Insert snap
  const { data, error } = await supabase
    .from('study_snaps')
    .insert({
      user_id: userId,
      image_url: imageUrl,
      caption: caption?.trim().slice(0, 200) || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Update streak in background
  updateStreakOnPost(userId).catch(console.warn);

  return rowToSnap(data);
}

/** Count how many snaps the user has posted today. */
export async function getMySnapsToday(userId: string): Promise<number> {
  const today = todayDateStr();
  const startOfDay = `${today}T00:00:00.000Z`;
  const endOfDay = `${today}T23:59:59.999Z`;

  const { count, error } = await supabase
    .from('study_snaps')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);

  if (error) {
    console.warn('[snapApi] getMySnapsToday error:', error);
    return 0;
  }
  return count || 0;
}

/** Get all active (non-expired) snaps from friends. Ordered by newest first. */
export async function getFriendsSnaps(userId: string): Promise<StudySnap[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('study_snaps')
    .select('*')
    .neq('user_id', userId)
    .gt('expires_at', now)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[snapApi] getFriendsSnaps error:', error);
    return [];
  }

  const snaps = (data || []).map(rowToSnap);

  // Enrich with author profiles
  const authorIds = [...new Set(snaps.map(s => s.userId))];
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', authorIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    for (const snap of snaps) {
      const prof = profileMap.get(snap.userId);
      snap.authorName = prof?.name || 'Unknown';
      snap.authorAvatar = prof?.avatar_url || undefined;
    }
  }

  return snaps;
}

/** Get my own active snaps. */
export async function getMyActiveSnaps(userId: string): Promise<StudySnap[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('study_snaps')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', now)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[snapApi] getMyActiveSnaps error:', error);
    return [];
  }

  return (data || []).map(rowToSnap);
}

/** Get a single snap by ID with author info. */
export async function getSnapById(snapId: string): Promise<StudySnap | null> {
  const { data, error } = await supabase
    .from('study_snaps')
    .select('*')
    .eq('id', snapId)
    .single();

  if (error || !data) return null;

  const snap = rowToSnap(data);

  const { data: prof } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .eq('id', snap.userId)
    .maybeSingle();

  snap.authorName = (prof as any)?.name || 'Unknown';
  snap.authorAvatar = (prof as any)?.avatar_url || undefined;

  return snap;
}

/**
 * Batch-fetch the most recent active snap per user.
 * Used by the map to swap avatars with snap photos.
 * Returns a Map of userId → imageUrl.
 */
export async function getLatestSnapForUsers(userIds: string[]): Promise<Map<string, StudySnap>> {
  if (userIds.length === 0) return new Map();

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('study_snaps')
    .select('*')
    .in('user_id', userIds)
    .gt('expires_at', now)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[snapApi] getLatestSnapForUsers error:', error);
    return new Map();
  }

  // Keep only the latest snap per user
  const result = new Map<string, StudySnap>();
  for (const row of data || []) {
    const snap = rowToSnap(row);
    if (!result.has(snap.userId)) {
      result.set(snap.userId, snap);
    }
  }

  return result;
}

/** Get snap history (past expired snaps). */
export async function getSnapHistory(userId: string, days: number): Promise<StudySnap[]> {
  if (days <= 0) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('study_snaps')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[snapApi] getSnapHistory error:', error);
    return [];
  }

  return (data || []).map(rowToSnap);
}

/** Delete a snap by ID. */
export async function deleteSnap(snapId: string): Promise<void> {
  const { error } = await supabase
    .from('study_snaps')
    .delete()
    .eq('id', snapId);

  if (error) throw error;
}

// =============================================================================
// Reactions
// =============================================================================

/** React to a snap with an emoji. Upserts (one reaction per user per snap). */
export async function reactToSnap(
  snapId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('snap_reactions')
    .upsert(
      { snap_id: snapId, user_id: userId, emoji },
      { onConflict: 'snap_id,user_id' },
    );

  if (error) throw error;
}

/** Remove my reaction from a snap. */
export async function removeReaction(snapId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('snap_reactions')
    .delete()
    .eq('snap_id', snapId)
    .eq('user_id', userId);

  if (error) throw error;
}

/** Get all reactions for a snap. */
export async function getSnapReactions(snapId: string): Promise<SnapReaction[]> {
  const { data, error } = await supabase
    .from('snap_reactions')
    .select('*')
    .eq('snap_id', snapId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[snapApi] getSnapReactions error:', error);
    return [];
  }

  return (data || []).map(rowToReaction);
}

// =============================================================================
// Streaks
// =============================================================================

/** Get my streak data. Returns a default SnapStreak if no row exists. */
export async function getMyStreak(userId: string): Promise<SnapStreak> {
  const { data, error } = await supabase
    .from('snap_streaks')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastSnapDate: null,
      revivalsUsed: 0,
      revivalMonth: 0,
    };
  }

  return rowToStreak(data);
}

/**
 * Update streak when a snap is posted.
 * Called internally by postSnap().
 */
async function updateStreakOnPost(userId: string): Promise<void> {
  const today = todayDateStr();
  const yesterday = yesterdayDateStr();

  const current = await getMyStreak(userId);

  let newStreak: number;

  if (current.lastSnapDate === today) {
    // Already posted today — no streak change
    return;
  } else if (current.lastSnapDate === yesterday) {
    // Consecutive day — increment
    newStreak = current.currentStreak + 1;
  } else {
    // Gap or first ever — start fresh
    newStreak = 1;
  }

  const newLongest = Math.max(current.longestStreak, newStreak);

  const { error } = await supabase
    .from('snap_streaks')
    .upsert({
      user_id: userId,
      current_streak: newStreak,
      longest_streak: newLongest,
      last_snap_date: today,
      revivals_used: current.revivalsUsed,
      revival_month: current.revivalMonth,
      updated_at: new Date().toISOString(),
    });

  if (error) console.warn('[snapApi] updateStreakOnPost error:', error);
}

/**
 * Attempt to revive a broken streak.
 * Returns true if revival succeeded, false if not eligible.
 */
export async function reviveStreak(
  userId: string,
  plan: SubscriptionPlan | undefined | null,
): Promise<boolean> {
  const current = await getMyStreak(userId);
  const today = todayDateStr();
  const thisMonth = currentYYYYMM();

  // Reset revivals if new month
  let revivalsUsed = current.revivalsUsed;
  if (current.revivalMonth !== thisMonth) {
    revivalsUsed = 0;
  }

  // Check limit
  const maxRevivals = maxStreakRevivals(plan);
  if (revivalsUsed >= maxRevivals) {
    return false; // No revivals left
  }

  // Can only revive if streak is currently broken (last_snap_date is before yesterday)
  if (current.lastSnapDate === today || current.lastSnapDate === yesterdayDateStr()) {
    return false; // Streak isn't actually broken
  }

  // Revive: restore previous streak + 1 and mark today
  const { error } = await supabase
    .from('snap_streaks')
    .upsert({
      user_id: userId,
      current_streak: current.currentStreak, // Keep the streak as it was
      longest_streak: current.longestStreak,
      last_snap_date: today,
      revivals_used: revivalsUsed + 1,
      revival_month: thisMonth,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.warn('[snapApi] reviveStreak error:', error);
    return false;
  }

  return true;
}

// =============================================================================
// View Count (Client-side, Free tier only)
// =============================================================================

/** Get how many friend snaps the Free user has viewed today. */
export async function getViewCountToday(): Promise<number> {
  const key = VIEW_COUNT_KEY_PREFIX + todayDateStr();
  const raw = await AsyncStorage.getItem(key);
  return raw ? parseInt(raw, 10) : 0;
}

/** Increment the daily view counter. */
export async function incrementViewCount(): Promise<number> {
  const key = VIEW_COUNT_KEY_PREFIX + todayDateStr();
  const current = await getViewCountToday();
  const next = current + 1;
  await AsyncStorage.setItem(key, String(next));
  return next;
}
