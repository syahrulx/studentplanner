import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import {
  fetchInAppNotifications,
  deleteInAppNotifications,
  deleteAllInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationsRead,
  type InAppNotification,
} from '@/src/lib/inAppNotifications';
import { supabase } from '@/src/lib/supabase';

export type { InAppNotification };

/* ─── helpers ─── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Pick a deterministic colour from a notification's category/type for the avatar circle. */
function avatarColor(item: InAppNotification): string {
  const t = (item.data?.type as string) ?? '';
  if (t === 'broadcast') return '#8b5cf6';
  if (t === 'service_chat_message') return '#3b82f6';
  if (t.startsWith('service_offer')) return '#f59e0b';
  if (t === 'service_completed' || t === 'service_review_received') return '#10b981';
  if (t === 'service_cancelled' || t === 'service_quit' || t === 'service_rejected') return '#ef4444';
  if (t === 'event_new') return '#ec4899';
  if (item.category === 'friend') return '#6366f1';
  return '#64748b';
}

/** Pick a Feather icon based on the notification type. */
function avatarIcon(item: InAppNotification): keyof typeof Feather.glyphMap {
  const t = (item.data?.type as string) ?? '';
  if (t === 'broadcast') return 'volume-2';
  if (item.category === 'friend') return 'users';
  if (item.category === 'event' || t === 'event_new') return 'calendar';
  if (t === 'service_chat_message') return 'message-circle';
  if (t === 'service_offer_new') return 'tag';
  if (t === 'service_offer_accepted') return 'check-circle';
  if (t === 'service_offer_rejected') return 'x-circle';
  if (t === 'service_submitted') return 'upload-cloud';
  if (t === 'service_completed') return 'award';
  if (t === 'service_rejected') return 'rotate-ccw';
  if (t === 'service_quit') return 'log-out';
  if (t === 'service_cancelled') return 'slash';
  if (t === 'service_cancel_requested') return 'alert-triangle';
  if (t === 'service_review_received') return 'star';
  return 'bell';
}

/* ─── component ─── */

export default function InboxScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allIds = useMemo(() => notifications.map((n) => n.id), [notifications]);
  const allSelected = selectionMode && notifications.length > 0 && selectedIds.size === notifications.length;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  }, [allIds]);

  /* ── data loading ── */

  const load = useCallback(async () => {
    try {
      setNotifications(await fetchInAppNotifications());
    } catch (e) {
      console.warn('Failed to load inbox:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  /* ── actions ── */

  const markAllAsRead = async () => {
    try {
      await markAllInAppNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e) {
      console.warn('Failed to mark read', e);
    }
  };

  const clearSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setClearing(true);
    try {
      await deleteInAppNotifications(Array.from(selectedIds));
      setNotifications((prev) => prev.filter((n) => !selectedIds.has(n.id)));
      exitSelectionMode();
    } catch (e) {
      console.warn(e);
      Alert.alert('Delete failed', 'Could not delete notifications. Please try again.');
    } finally {
      setClearing(false);
    }
  }, [selectedIds, exitSelectionMode]);

  const clearAll = useCallback(async () => {
    Alert.alert(
      'Delete all notifications?',
      'This will permanently remove all your notifications.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await deleteAllInAppNotifications();
              setNotifications([]);
              exitSelectionMode();
            } catch (e) {
              console.warn(e);
              Alert.alert('Delete failed', 'Could not delete notifications.');
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  }, [exitSelectionMode]);

  const handlePress = async (item: InAppNotification) => {
    // Mark as read optimistically
    if (!item.is_read) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
      supabase.from('in_app_notifications').update({ is_read: true }).eq('id', item.id).then();
    }

    // Routing logic based on data type
    const t = item.data?.type as string | undefined;
    if (t === 'broadcast') {
      // Admin broadcast — honour an optional in-app deep link, otherwise stay put.
      const rawRoute = typeof item.data?.route === 'string' ? (item.data.route as string).trim() : '';
      if (rawRoute.startsWith('/')) {
        const params = item.data?.params && typeof item.data.params === 'object' ? item.data.params : null;
        if (params && Object.keys(params).length > 0) {
          router.push({ pathname: rawRoute, params } as any);
        } else {
          router.push(rawRoute as any);
        }
      }
    } else if (t === 'service_chat_message' && item.data?.serviceId) {
      router.push(`/services/chat/${item.data.serviceId}` as any);
    } else if (t?.startsWith('service') || t === 'event_new') {
      const postId = item.data?.serviceId || item.data?.eventId;
      if (postId) {
        router.push(`/services/${postId}` as any);
      } else {
        router.push('/(tabs)/community' as any);
      }
    } else if (item.category === 'friend') {
      router.push('/profile' as any);
    }
  };

  /* ── render ── */

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header — matches community/notifications style */}
      <View style={[styles.headerRow, { paddingTop: Platform.OS === 'ios' ? insets.top + 4 : 40 }]}>
        <Pressable
          onPress={() => (selectionMode ? exitSelectionMode() : router.back())}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name={selectionMode ? 'x' : 'chevron-left'} size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {selectionMode
            ? `${selectedIds.size} selected`
            : 'Notifications'}
        </Text>

        {selectionMode ? (
          <View style={styles.headerActionsRow}>
            <Pressable
              disabled={notifications.length === 0}
              onPress={toggleSelectAll}
              style={({ pressed }) => [
                styles.headerBtn,
                {
                  borderColor: theme.border,
                  opacity: notifications.length === 0 ? 0.35 : pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text style={[styles.headerBtnText, { color: theme.textSecondary }]}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </Text>
            </Pressable>
            <Pressable
              disabled={clearing || selectedIds.size === 0}
              onPress={() => {
                const count = selectedIds.size;
                if (count === 0) return;
                Alert.alert(
                  'Delete selected?',
                  `Delete ${count} notification${count > 1 ? 's' : ''}?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => void clearSelected(),
                    },
                  ],
                );
              }}
              style={({ pressed }) => [
                styles.headerBtn,
                styles.destructiveBtn,
                {
                  borderColor: '#ef4444',
                  opacity: selectedIds.size === 0 ? 0.35 : pressed ? 0.75 : 1,
                },
              ]}
            >
              {clearing ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <Text style={[styles.headerBtnText, { color: '#ef4444' }]}>
                  Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.headerActionsRow}>
            {unreadCount > 0 && (
              <Pressable
                onPress={markAllAsRead}
                style={({ pressed }) => [
                  styles.headerBtn,
                  { borderColor: theme.border },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Feather name="check-circle" size={14} color={theme.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.headerBtnText, { color: theme.primary }]}>Read all</Text>
              </Pressable>
            )}
            {notifications.length > 0 && (
              <Pressable
                onPress={() => setSelectionMode(true)}
                style={({ pressed }) => [
                  styles.headerBtn,
                  { borderColor: theme.border },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={[styles.headerBtnText, { color: theme.textSecondary }]}>Select</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="bell-off" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No notifications yet</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            Broadcasts, service updates, and friend activity will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            notifications.length > 0 && !selectionMode ? (
              <Pressable
                onPress={clearAll}
                style={({ pressed }) => [
                  styles.clearAllBtn,
                  { borderColor: theme.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Feather name="trash-2" size={14} color="#ef4444" />
                <Text style={styles.clearAllText}>Delete all notifications</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const isRead = item.is_read;
            const isSelected = selectedIds.has(item.id);
            const bg = avatarColor(item);
            const icon = avatarIcon(item);

            return (
              <Pressable
                style={({ pressed }) => [
                  styles.notifCard,
                  {
                    backgroundColor: isSelected
                      ? theme.primary + '16'
                      : isRead
                        ? theme.card
                        : theme.primary + '08',
                    borderColor: isSelected
                      ? theme.primary
                      : isRead
                        ? theme.border
                        : theme.primary + '30',
                  },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => {
                  if (selectionMode) toggleSelected(item.id);
                  else handlePress(item);
                }}
                onLongPress={() => {
                  if (!selectionMode) setSelectionMode(true);
                  toggleSelected(item.id);
                }}
              >
                {/* Selection checkbox */}
                {selectionMode ? (
                  <View
                    style={[
                      styles.selectCheckbox,
                      {
                        borderColor: isSelected ? theme.primary : theme.border,
                        backgroundColor: isSelected ? theme.primary : 'transparent',
                      },
                    ]}
                  >
                    {isSelected ? <Feather name="check" size={14} color="#fff" /> : null}
                  </View>
                ) : null}

                {/* Avatar icon */}
                <View style={[styles.avatarCircle, { backgroundColor: bg + (isRead ? '30' : '') }, isRead && styles.avatarDim]}>
                  <Feather name={icon} size={20} color={isRead ? bg : '#fff'} />
                </View>

                {/* Body */}
                <View style={styles.notifBody}>
                  <View style={styles.notifTopRow}>
                    <Text
                      style={[styles.notifTitle, { color: isRead ? theme.textSecondary : theme.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.notifTime, { color: isRead ? theme.tabIconDefault : theme.textSecondary }]}>
                      {timeAgo(item.created_at)}
                    </Text>
                  </View>
                  <View style={styles.notifMessageRow}>
                    <Text
                      style={[styles.notifMessage, { color: isRead ? theme.tabIconDefault : theme.textSecondary }]}
                      numberOfLines={3}
                    >
                      {item.body}
                    </Text>
                  </View>
                </View>

                {/* Unread dot */}
                {!isRead && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Header — matches community/notifications.tsx */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 56,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
  },
  headerBtnText: { fontSize: 14, fontWeight: '700' },
  destructiveBtn: {
    borderWidth: 1.5,
  },

  /* Selection */
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  /* Cards — matches community/notifications.tsx */
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    position: 'relative',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDim: { opacity: 0.65 },
  notifBody: { flex: 1, minWidth: 0 },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  notifTitle: { fontSize: 15, fontWeight: '700', flex: 1, minWidth: 0 },
  notifTime: { fontSize: 12, fontWeight: '600', flexShrink: 0, marginTop: 2 },
  notifMessageRow: {
    marginTop: 4,
  },
  notifMessage: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  /* Empty state */
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 240 },

  /* Clear all */
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  clearAllText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
});
