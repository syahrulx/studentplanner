import { supabase } from './supabase';

export type CommunityPushPrefs = {
  communityPushEnabled: boolean;
  pushReactionsEnabled: boolean;
  pushFriendRequestsEnabled: boolean;
  pushCircleEnabled: boolean;
  pushSharedTaskEnabled: boolean;
};

export const DEFAULT_COMMUNITY_PUSH_PREFS: CommunityPushPrefs = {
  communityPushEnabled: true,
  pushReactionsEnabled: true,
  pushFriendRequestsEnabled: true,
  pushCircleEnabled: true,
  pushSharedTaskEnabled: true,
};

type ProfileRow = {
  community_push_enabled: boolean | null;
  push_reactions_enabled: boolean | null;
  push_friend_requests_enabled: boolean | null;
  push_circle_enabled: boolean | null;
  push_shared_task_enabled: boolean | null;
};

/** Fetch current push prefs for the user, falling back to defaults on any error. */
export async function getCommunityPushPrefs(userId: string): Promise<CommunityPushPrefs> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'community_push_enabled, push_reactions_enabled, push_friend_requests_enabled, push_circle_enabled, push_shared_task_enabled',
      )
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return DEFAULT_COMMUNITY_PUSH_PREFS;
    const row = data as ProfileRow;
    return {
      communityPushEnabled: row.community_push_enabled ?? true,
      pushReactionsEnabled: row.push_reactions_enabled ?? true,
      pushFriendRequestsEnabled: row.push_friend_requests_enabled ?? true,
      pushCircleEnabled: row.push_circle_enabled ?? true,
      pushSharedTaskEnabled: row.push_shared_task_enabled ?? true,
    };
  } catch {
    return DEFAULT_COMMUNITY_PUSH_PREFS;
  }
}

/** Patch only the provided fields; returns true on success. */
export async function updateCommunityPushPrefs(
  userId: string,
  patch: Partial<CommunityPushPrefs>,
): Promise<boolean> {
  const payload: Record<string, boolean> = {};
  if (patch.communityPushEnabled !== undefined) payload.community_push_enabled = patch.communityPushEnabled;
  if (patch.pushReactionsEnabled !== undefined) payload.push_reactions_enabled = patch.pushReactionsEnabled;
  if (patch.pushFriendRequestsEnabled !== undefined) payload.push_friend_requests_enabled = patch.pushFriendRequestsEnabled;
  if (patch.pushCircleEnabled !== undefined) payload.push_circle_enabled = patch.pushCircleEnabled;
  if (patch.pushSharedTaskEnabled !== undefined) payload.push_shared_task_enabled = patch.pushSharedTaskEnabled;

  if (Object.keys(payload).length === 0) return true;

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  return !error;
}
