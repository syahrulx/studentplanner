import { supabase } from './supabase';

export interface InAppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: string;
  is_read: boolean;
  created_at: string;
  data: Record<string, unknown> | null;
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
  return (data ?? []) as InAppNotification[];
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
