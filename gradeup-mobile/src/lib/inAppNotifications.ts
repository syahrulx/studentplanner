import { supabase } from './supabase';

export interface SenderProfile {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

export interface InAppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: string;
  is_read: boolean;
  created_at: string;
  data: Record<string, unknown> | null;
  /** Enriched client-side after fetch — same as community notifications pattern. */
  sender_profile?: SenderProfile | null;
}

/** Resolve the signed-in Supabase user id (same source community notifications use). */
export async function getInAppNotificationUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function fetchUnreadInAppCount(userId?: string | null): Promise<number> {
  const uid = userId ?? (await getInAppNotificationUserId());
  if (!uid) return 0;

  const { count, error } = await supabase
    .from('in_app_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .eq('is_read', false);

  if (error) {
    if (__DEV__) console.warn('[inAppNotifications] unread count failed:', error.message);
    throw error;
  }
  return count ?? 0;
}

/** Extract a sender UUID from a notification's data field. Mirrors the trigger payload shape. */
function extractSenderId(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  // Try all known sender ID keys used by triggers
  return (
    (data.senderId as string) ||
    (data.requesterId as string) ||
    (data.friendId as string) ||
    (data.inviterId as string) ||
    (data.actorId as string) ||
    null
  );
}

export async function fetchInAppNotifications(limit = 50): Promise<InAppNotification[]> {
  const uid = await getInAppNotificationUserId();
  if (!uid) return [];

  const { data, error } = await supabase
    .from('in_app_notifications')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (__DEV__) console.warn('[inAppNotifications] list failed:', error.message);
    throw error;
  }

  const notifications = (data ?? []) as InAppNotification[];

  // Collect all unique sender IDs — same client-side pattern as community notifications.
  const senderIds = [
    ...new Set(
      notifications
        .map((n) => extractSenderId(n.data))
        .filter((id): id is string => !!id),
    ),
  ];

  // Batch fetch profiles in a single query (no extra migration needed).
  const profileMap = new Map<string, SenderProfile>();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', senderIds);

    for (const p of profiles ?? []) {
      profileMap.set(p.id, p as SenderProfile);
    }
  }

  // Attach sender_profile to each notification.
  return notifications.map((n) => {
    const senderId = extractSenderId(n.data);
    return {
      ...n,
      sender_profile: senderId ? (profileMap.get(senderId) ?? null) : null,
    };
  });
}

/** Live badge updates when new in-app notifications arrive. */
export function subscribeInAppNotifications(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`in-app-notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'in_app_notifications',
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Delete specific notifications by ID. */
export async function deleteInAppNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('in_app_notifications')
    .delete()
    .in('id', ids);
  if (error) throw error;
}

/** Delete ALL notifications for the current user. */
export async function deleteAllInAppNotifications(): Promise<void> {
  const uid = await getInAppNotificationUserId();
  if (!uid) return;
  const { error } = await supabase
    .from('in_app_notifications')
    .delete()
    .eq('user_id', uid);
  if (error) throw error;
}

/** Mark specific notifications as read by ID. */
export async function markInAppNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const uid = await getInAppNotificationUserId();
  if (!uid) return;
  const { error } = await supabase
    .from('in_app_notifications')
    .update({ is_read: true })
    .eq('user_id', uid)
    .in('id', ids);
  if (error) throw error;
}

/** Mark ALL notifications as read for the current user. */
export async function markAllInAppNotificationsRead(): Promise<void> {
  const uid = await getInAppNotificationUserId();
  if (!uid) return;
  const { error } = await supabase
    .from('in_app_notifications')
    .update({ is_read: true })
    .eq('user_id', uid)
    .eq('is_read', false);
  if (error) throw error;
}
