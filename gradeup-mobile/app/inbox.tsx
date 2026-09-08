import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Modal,
  Platform,
  Image,
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
  type InAppNotification,
} from '@/src/lib/inAppNotifications';
import { supabase } from '@/src/lib/supabase';

export type { InAppNotification };

/** Notification types that route to a fixed screen with no id in `data` (see openNotificationAction). */
const NOTIF_ACTION_TYPES = new Set([
  'reaction', 'circle_invitation', 'circle_invitation_response',
  'shared_task', 'shared_task_response', 'shared_task_completed',
]);

/* ─── Avatar — identical to community/notifications.tsx ─── */

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, avatarUrl, size = 44 }: { name?: string | null; avatarUrl?: string | null; size?: number }) {
  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const i = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS[i], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{getInitials(name)}</Text>
    </View>
  );
}

/** Fallback icon-only avatar for notifications with no sender (broadcasts, system). */
function IconAvatar({ icon, color, size = 44, dimmed }: { icon: keyof typeof Feather.glyphMap; color: string; size?: number; dimmed?: boolean }) {
  return (
    <View style={[
      { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '25', alignItems: 'center', justifyContent: 'center' },
      dimmed && { opacity: 0.6 },
    ]}>
      <Feather name={icon} size={size * 0.44} color={color} />
    </View>
  );
}

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

function notifIcon(item: InAppNotification): keyof typeof Feather.glyphMap {
  const t = (item.data?.type as string) ?? '';
  if (t === 'broadcast') return 'volume-2';
  if (item.category === 'friend' || t === 'friend_request' || t === 'friend_accepted') return 'users';
  if (item.category === 'event' || t === 'event_new') return 'calendar';
  if (t === 'service_chat_message') return 'message-circle';
  if (t === 'service_offer_new') return 'tag';
  if (t === 'service_offer_accepted' || t === 'service_completed') return 'check-circle';
  if (t === 'service_offer_rejected' || t === 'service_rejected') return 'x-circle';
  if (t === 'service_review_received') return 'star';
  if (t === 'service_cancelled' || t === 'service_quit') return 'slash';
  return 'bell';
}

function notifIconColor(item: InAppNotification): string {
  const t = (item.data?.type as string) ?? '';
  if (t === 'broadcast') return '#8b5cf6';
  if (t === 'service_completed' || t === 'service_offer_accepted' || t === 'friend_accepted') return '#10b981';
  if (t === 'service_cancelled' || t === 'service_rejected' || t === 'service_offer_rejected' || t === 'service_quit') return '#ef4444';
  if (t === 'service_chat_message') return '#3b82f6';
  if (t === 'service_offer_new') return '#f59e0b';
  if (t === 'service_review_received') return '#f59e0b';
  if (item.category === 'friend') return '#6366f1';
  if (item.category === 'event') return '#ec4899';
  return '#64748b';
}

/* ─── main screen ─── */

export default function InboxScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selection mode — identical UX to community/notifications.tsx
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [openedNotification, setOpenedNotification] = useState<InAppNotification | null>(null);

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
    setSelectedIds((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }, [allIds]);

  /* ── data ── */

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
    }, [load]),
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
    } catch {
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
            } catch {
              Alert.alert('Delete failed', 'Could not delete notifications.');
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  }, [exitSelectionMode]);

  const openNotificationAction = (item: InAppNotification): boolean => {
    const t = item.data?.type as string | undefined;
    if (t === 'broadcast' || t === 'support_reply') {
      const rawRoute = typeof item.data?.route === 'string' ? (item.data.route as string).trim() : '';
      if (rawRoute.startsWith('/')) {
        const params = item.data?.params && typeof item.data.params === 'object' ? item.data.params as any : null;
        if (params && Object.keys(params).length > 0) {
          router.push({ pathname: rawRoute, params } as any);
        } else {
          router.push(rawRoute as any);
        }
        return true;
      }
    } else if (t === 'service_chat_message' && item.data?.serviceId) {
      router.push(`/services/chat/${item.data.serviceId}` as any);
      return true;
    } else if (t?.startsWith('service') || t === 'event_new') {
      const postId = item.data?.serviceId || item.data?.eventId;
      if (postId) router.push(`/services/${postId}` as any);
      else router.push('/(tabs)/community' as any);
      return true;
    } else if (item.category === 'friend' || t === 'friend_request' || t === 'friend_accepted') {
      router.push('/profile' as any);
      return true;
    } else if (t === 'circle_invitation_response' && item.data?.circleId) {
      router.push({ pathname: '/community/circle-detail', params: { id: item.data.circleId } } as any);
      return true;
    } else if (t === 'quiz_invite' && item.data?.sessionId) {
      router.push({ pathname: '/match-lobby', params: { sessionId: String(item.data.sessionId) } } as any);
      return true;
    } else if (
      t === 'reaction' ||
      t === 'circle_invitation' ||
      t === 'shared_task' ||
      t === 'shared_task_response' ||
      t === 'shared_task_completed'
    ) {
      router.push('/community/notifications' as any);
      return true;
    }
    return false;
  };

  const handlePress = async (item: InAppNotification) => {
    if (!item.is_read) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
      supabase.from('in_app_notifications').update({ is_read: true }).eq('id', item.id).then();
    }

    // Actionable notifications now go straight to their destination. The old
    // flow opened a second notification modal over the notification list and
    // required another tap on "Open".
    if (openNotificationAction(item)) return;

    // Non-actionable informational messages still get a full-text view.
    setOpenedNotification(item);
  };

  /* ── render ── */

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const hasSender = (item: InAppNotification) => !!(item.sender_profile?.name || item.sender_profile?.avatar_url);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      {/* Header — identical structure to community/notifications.tsx */}
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
          {selectionMode ? `${selectedIds.size} selected` : 'Notifications'}
        </Text>

        {selectionMode ? (
          <View style={styles.headerActionsRow}>
            <Pressable
              disabled={notifications.length === 0}
              onPress={toggleSelectAll}
              style={({ pressed }) => [
                styles.headerBtn,
                { borderColor: theme.border, opacity: notifications.length === 0 ? 0.35 : pressed ? 0.75 : 1 },
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
                if (!count) return;
                Alert.alert(
                  'Delete selected?',
                  `Delete ${count} notification${count > 1 ? 's' : ''}?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => void clearSelected() },
                  ],
                );
              }}
              style={({ pressed }) => [
                styles.headerBtn,
                styles.destructiveBtn,
                { borderColor: '#ef4444', opacity: selectedIds.size === 0 ? 0.35 : pressed ? 0.75 : 1 },
              ]}
            >
              {clearing
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <Text style={[styles.headerBtnText, { color: '#ef4444' }]}>Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</Text>
              }
            </Pressable>
          </View>
        ) : (
          <View style={styles.headerActionsRow}>
            {unreadCount > 0 && (
              <Pressable
                onPress={markAllAsRead}
                style={({ pressed }) => [styles.headerBtn, { borderColor: theme.border }, pressed && { opacity: 0.75 }]}
              >
                <Feather name="check-circle" size={13} color={theme.primary} style={{ marginRight: 3 }} />
                <Text style={[styles.headerBtnText, { color: theme.primary }]}>Read all</Text>
              </Pressable>
            )}
            {notifications.length > 0 && (
              <Pressable
                onPress={() => setSelectionMode(true)}
                style={({ pressed }) => [styles.headerBtn, { borderColor: theme.border }, pressed && { opacity: 0.75 }]}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            !selectionMode ? (
              <Pressable
                onPress={clearAll}
                style={({ pressed }) => [styles.clearAllBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
              >
                <Feather name="trash-2" size={14} color="#ef4444" />
                <Text style={styles.clearAllText}>Delete all notifications</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const isRead = item.is_read;
            const isSelected = selectedIds.has(item.id);
            const withSender = hasSender(item);

            return (
              <Pressable
                style={({ pressed }) => [
                  styles.notifCard,
                  {
                    backgroundColor: isSelected
                      ? theme.primary + '16'
                      : isRead ? theme.card : theme.primary + '08',
                    borderColor: isSelected
                      ? theme.primary
                      : isRead ? theme.border : theme.primary + '30',
                  },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => selectionMode ? toggleSelected(item.id) : handlePress(item)}
                onLongPress={() => { if (!selectionMode) setSelectionMode(true); toggleSelected(item.id); }}
              >
                {/* Checkbox in selection mode */}
                {selectionMode && (
                  <View style={[
                    styles.selectCheckbox,
                    { borderColor: isSelected ? theme.primary : theme.border, backgroundColor: isSelected ? theme.primary : 'transparent' },
                  ]}>
                    {isSelected && <Feather name="check" size={14} color="#fff" />}
                  </View>
                )}

                {/* Avatar: real profile picture if sender known, icon otherwise */}
                <View style={isRead ? styles.avatarDim : undefined}>
                  {withSender ? (
                    <Avatar
                      name={item.sender_profile?.name}
                      avatarUrl={item.sender_profile?.avatar_url}
                      size={44}
                    />
                  ) : (
                    <IconAvatar
                      icon={notifIcon(item)}
                      color={notifIconColor(item)}
                      size={44}
                      dimmed={isRead}
                    />
                  )}
                </View>

                {/* Body */}
                <View style={styles.notifBody}>
                  <View style={styles.notifTopRow}>
                    <Text
                      style={[styles.notifName, { color: isRead ? theme.textSecondary : theme.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {/* Show sender name as the "header" if we have one, else use notification title */}
                      {withSender ? (item.sender_profile!.name ?? item.title) : item.title}
                    </Text>
                    <Text style={[styles.notifTime, { color: isRead ? theme.tabIconDefault : theme.textSecondary }]}>
                      {timeAgo(item.created_at)}
                    </Text>
                  </View>

                  <View style={styles.notifMessageRow}>
                    {withSender ? <View style={styles.notifLeadSlot}>
                      <Feather
                        name={notifIcon(item)}
                        size={16}
                        color={isRead ? theme.tabIconDefault : notifIconColor(item)}
                      />
                    </View> : null}
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
      <Modal
        transparent
        animationType="fade"
        visible={!!openedNotification}
        onRequestClose={() => setOpenedNotification(null)}
      >
        <View style={styles.detailOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpenedNotification(null)} />
          <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.detailHeader}>
              <IconAvatar
                icon={openedNotification ? notifIcon(openedNotification) : 'bell'}
                color={openedNotification ? notifIconColor(openedNotification) : theme.primary}
              />
              <Pressable onPress={() => setOpenedNotification(null)} style={styles.detailClose}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.detailTitle, { color: theme.text }]}>{openedNotification?.title}</Text>
            <Text style={[styles.detailDate, { color: theme.textSecondary }]}>
              {openedNotification ? new Date(openedNotification.created_at).toLocaleString() : ''}
            </Text>
            <ScrollView style={styles.detailBodyScroll} contentContainerStyle={styles.detailBodyContent}>
              <Text style={[styles.detailBody, { color: theme.text }]}>{openedNotification?.body}</Text>
            </ScrollView>
            {openedNotification?.data?.route ||
            openedNotification?.data?.serviceId ||
            openedNotification?.data?.eventId ||
            NOTIF_ACTION_TYPES.has(openedNotification?.data?.type as string) ? (
              <Pressable
                onPress={() => {
                  if (!openedNotification) return;
                  const item = openedNotification;
                  setOpenedNotification(null);
                  openNotificationAction(item);
                }}
                style={[styles.detailAction, { backgroundColor: theme.primary }]}
              >
                <Text style={{ color: theme.textInverse, fontWeight: '800' }}>Open</Text>
                <Feather name="arrow-up-right" size={17} color={theme.textInverse} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header — matches community/notifications.tsx exactly
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  headerActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  destructiveBtn: { borderWidth: 1.5 },

  // Checkbox
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  // Cards — matches community/notifications.tsx notifCard
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
  avatarDim: { opacity: 0.65 },
  notifBody: { flex: 1, minWidth: 0 },
  notifTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  notifName: { fontSize: 15, fontWeight: '700', flex: 1, minWidth: 0 },
  notifTime: { fontSize: 12, fontWeight: '600', flexShrink: 0, marginTop: 2 },
  notifMessageRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6, gap: 4 },
  notifLeadSlot: { width: 28, minHeight: 22, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  notifMessage: { fontSize: 14, lineHeight: 21, flex: 1, minWidth: 0, fontWeight: '500' },
  unreadDot: { position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: 4 },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 240 },

  // Footer
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
  detailOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,0.55)' },
  detailCard: { maxHeight: '75%', borderWidth: 1, borderRadius: 24, padding: 20 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  detailClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  detailTitle: { marginTop: 14, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  detailDate: { marginTop: 6, fontSize: 12, fontWeight: '600' },
  detailBodyScroll: { marginTop: 18 },
  detailBodyContent: { paddingBottom: 4 },
  detailBody: { fontSize: 15, lineHeight: 23, fontWeight: '500' },
  detailAction: { marginTop: 20, minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
