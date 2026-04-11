import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useCommunity } from '@/src/context/CommunityContext';
import * as communityApi from '@/src/lib/communityApi';
import type { CircleInvitation, QuickReaction } from '@/src/lib/communityApi';

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, avatarUrl, size = 40 }: { name?: string; avatarUrl?: string; size?: number }) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const i = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[i], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{getInitials(name)}</Text>
    </View>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Title-case long ALL-CAPS names so the header row stays readable. */
function formatDisplayName(name?: string | null) {
  if (!name?.trim()) return 'Someone';
  const s = name.trim();
  if (s !== s.toUpperCase() || s.length < 8) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

type ReactionPreview = { lead: string; text: string };

function reactionPreviewLines(reaction: QuickReaction, isBump: boolean): ReactionPreview {
  if (isBump) return { lead: '💥', text: 'Bumped you!' };
  if (reaction.reaction_type === '📋') {
    return { lead: '📋', text: reaction.message || 'Shared a task with you!' };
  }
  if (reaction.reaction_type === '🎮') {
    return { lead: '🎮', text: reaction.message || 'Invited you to a quiz!' };
  }
  if (reaction.message) {
    const lead = reaction.reaction_type?.trim() || '';
    return { lead, text: reaction.message };
  }
  const emoji = reaction.reaction_type?.trim() || '✨';
  return { lead: emoji, text: 'Sent you' };
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const { userId, refreshUnreadCount, incomingSharedTasks, respondToShare, refreshSharedTasks, refreshCircles, incomingRequests, refreshRequests, refreshFriends } = useCommunity();

  const [reactions, setReactions] = useState<QuickReaction[]>([]);
  const [circleInvites, setCircleInvites] = useState<CircleInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());
  const [respondingInviteIds, setRespondingInviteIds] = useState<Set<string>>(new Set());
  const [respondingFriendIds, setRespondingFriendIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);

  const handleShareResponse = async (sharedTaskId: string, accept: boolean) => {
    setRespondingIds(prev => new Set(prev).add(sharedTaskId));
    await respondToShare(sharedTaskId, accept);
    setRespondingIds(prev => {
      const next = new Set(prev);
      next.delete(sharedTaskId);
      return next;
    });
  };

  const handleFriendResponse = async (friendshipId: string, accept: boolean) => {
    setRespondingFriendIds(prev => new Set(prev).add(friendshipId));
    try {
      if (accept) {
        await communityApi.acceptFriendRequest(friendshipId);
      } else {
        await communityApi.removeFriend(friendshipId);
      }
      await refreshRequests();
      await refreshFriends();
    } catch (e) {
      console.warn('Failed to respond to friend request:', e);
    }
    setRespondingFriendIds(prev => {
      const next = new Set(prev);
      next.delete(friendshipId);
      return next;
    });
  };

  const loadReactions = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await communityApi.getMyReactions(userId);
      setReactions(data);
      const invites = await communityApi.getMyCircleInvitations(userId).catch(() => [] as CircleInvitation[]);
      setCircleInvites(invites.filter((i) => i.status === 'pending'));
      // Mark all as read and sync local state so read styling applies
      await communityApi.markReactionsRead(userId);
      setReactions((prev) => prev.map((r) => ({ ...r, read: true })));
      await refreshUnreadCount();
    } catch (e) {
      console.warn(e);
    }
    setLoading(false);
  }, [userId, refreshUnreadCount]);

  useEffect(() => {
    loadReactions();
  }, [loadReactions]);

  const isFriendRequestReaction = useCallback((r: QuickReaction) => {
    return r.reaction_type === '👋' && Boolean(r.message?.toLowerCase().includes('friend request'));
  }, []);

  const handleReply = useCallback(
    async (reaction: QuickReaction) => {
      if (!userId) return;
      if (isFriendRequestReaction(reaction)) {
        router.push({ pathname: '/community/add-friend', params: { tab: 'incoming' } } as any);
        return;
      }
      router.push({
        pathname: '/community/friend-profile',
        params: { friendId: reaction.sender_id },
      } as any);
    },
    [userId, isFriendRequestReaction]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
        <Pressable
          disabled={clearing || reactions.length === 0}
          onPress={() => {
            Alert.alert(
              'Clear notifications',
              'Remove all reaction notifications from your history? Friend requests, circle invites, and task shares stay here until you act on them.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: async () => {
                    if (!userId) return;
                    setClearing(true);
                    try {
                      await communityApi.clearMyReceivedReactions(userId);
                      setReactions([]);
                      await refreshUnreadCount();
                    } catch (e) {
                      console.warn(e);
                      Alert.alert('Could not clear', 'Please try again.');
                    }
                    setClearing(false);
                  },
                },
              ],
            );
          }}
          style={({ pressed }) => [
            styles.clearHeaderBtn,
            { borderColor: theme.border, opacity: reactions.length === 0 ? 0.35 : pressed ? 0.75 : 1 },
          ]}
        >
          {clearing ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Text style={[styles.clearHeaderBtnText, { color: theme.textSecondary }]}>Clear</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Friend Requests */}
        {incomingRequests.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Friend Requests</Text>
            {incomingRequests.map((req) => (
              <View
                key={req.id}
                style={[styles.shareRequestCard, { backgroundColor: theme.primary + '08', borderColor: theme.primary + '25' }]}
              >
                <Avatar name={req.profile?.name} avatarUrl={req.profile?.avatar_url} size={44} />
                <View style={styles.notifBody}>
                  <Text style={[styles.notifName, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
                    {formatDisplayName(req.profile?.name)}
                  </Text>
                  <Text style={[styles.notifMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                    Wants to be your friend
                    {req.profile?.university ? ` · ${req.profile.university}` : ''}
                  </Text>
                  <View style={styles.shareActions}>
                    <Pressable
                      style={[styles.shareAcceptBtn, { backgroundColor: '#10b981' }]}
                      disabled={respondingFriendIds.has(req.id)}
                      onPress={() => handleFriendResponse(req.id, true)}
                    >
                      <Feather name="check" size={14} color="#fff" />
                      <Text style={styles.shareActionText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.shareDeclineBtn, { borderColor: theme.border }]}
                      disabled={respondingFriendIds.has(req.id)}
                      onPress={() => handleFriendResponse(req.id, false)}
                    >
                      <Text style={[styles.shareDeclineText, { color: theme.textSecondary }]}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Circle Invites */}
        {circleInvites.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Circle Invites</Text>
            {circleInvites.map((inv) => (
              <View
                key={inv.id}
                style={[styles.shareRequestCard, { backgroundColor: theme.primary + '08', borderColor: theme.primary + '25' }]}
              >
                <Avatar name={inv.inviter_profile?.name} avatarUrl={inv.inviter_profile?.avatar_url} size={44} />
                <View style={styles.notifBody}>
                  <Text style={[styles.notifName, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
                    {formatDisplayName(inv.inviter_profile?.name)}
                  </Text>
                  <Text style={[styles.notifMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                    Invited you to join {inv.circle ? `${inv.circle.emoji} ${inv.circle.name}` : 'a circle'}
                  </Text>
                  <View style={styles.shareActions}>
                    <Pressable
                      style={[styles.shareAcceptBtn, { backgroundColor: '#10b981' }]}
                      disabled={respondingInviteIds.has(inv.id)}
                      onPress={async () => {
                        setRespondingInviteIds((prev) => new Set(prev).add(inv.id));
                        try {
                          await communityApi.respondToCircleInvitation(inv.id, true);
                          await refreshCircles();
                          await loadReactions();
                        } finally {
                          setRespondingInviteIds((prev) => {
                            const next = new Set(prev);
                            next.delete(inv.id);
                            return next;
                          });
                        }
                      }}
                    >
                      <Feather name="check" size={14} color="#fff" />
                      <Text style={styles.shareActionText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.shareDeclineBtn, { borderColor: theme.border }]}
                      disabled={respondingInviteIds.has(inv.id)}
                      onPress={async () => {
                        setRespondingInviteIds((prev) => new Set(prev).add(inv.id));
                        try {
                          await communityApi.respondToCircleInvitation(inv.id, false);
                          await loadReactions();
                        } finally {
                          setRespondingInviteIds((prev) => {
                            const next = new Set(prev);
                            next.delete(inv.id);
                            return next;
                          });
                        }
                      }}
                    >
                      <Text style={[styles.shareDeclineText, { color: theme.textSecondary }]}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        {/* Incoming Shared Task Requests */}
        {incomingSharedTasks.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Task Share Requests</Text>
            {incomingSharedTasks.map(st => (
              <Pressable
                key={st.id}
                style={[styles.shareRequestCard, { backgroundColor: theme.primary + '08', borderColor: theme.primary + '25' }]}
                onPress={() => {
                  router.push({ pathname: '/community/shared-task-preview', params: { id: st.id } } as any);
                }}
              >
                <Avatar
                  name={st.owner_profile?.name}
                  avatarUrl={st.owner_profile?.avatar_url}
                  size={44}
                />
                <View style={styles.notifBody}>
                  <Text style={[styles.notifName, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
                    {formatDisplayName(st.owner_profile?.name)}
                  </Text>
                  <Text style={[styles.notifMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                    Shared a task: {st.task?.title || 'Task'}
                    {st.message ? `\n"${st.message}"` : ''}
                  </Text>
                  <View style={styles.shareActions}>
                    <Pressable
                      style={[styles.shareAcceptBtn, { backgroundColor: '#10b981' }]}
                      disabled={respondingIds.has(st.id)}
                      onPress={() => {
                        router.push({ pathname: '/community/shared-task-preview', params: { id: st.id } } as any);
                      }}
                    >
                      <Feather name="check" size={14} color="#fff" />
                      <Text style={styles.shareActionText}>View</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.shareDeclineBtn, { borderColor: theme.border }]}
                      disabled={respondingIds.has(st.id)}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleShareResponse(st.id, false);
                      }}
                    >
                      <Text style={[styles.shareDeclineText, { color: theme.textSecondary }]}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={theme.primary} />
        ) : reactions.length === 0 && incomingSharedTasks.length === 0 && circleInvites.length === 0 && incomingRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="bell-off" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No notifications yet</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
              When friends send you reactions or bumps, they'll show up here
            </Text>
          </View>
        ) : (
          reactions.map((reaction) => {
            const isBump = reaction.reaction_type === 'bump';
            const { lead, text } = reactionPreviewLines(reaction, isBump);
            const isRead = reaction.read;
            const nameColor = isRead ? theme.textSecondary : theme.text;
            const subColor = isRead ? theme.tabIconDefault : theme.textSecondary;
            const timeColor = isRead ? theme.tabIconDefault : theme.textSecondary;
            return (
              <Pressable
                key={reaction.id}
                style={({ pressed }) => [
                  styles.notifCard,
                  {
                    backgroundColor: isRead ? theme.card : theme.primary + '08',
                    borderColor: isRead ? theme.border : theme.primary + '30',
                  },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => handleReply(reaction)}
              >
                <View style={isRead ? styles.avatarDim : undefined}>
                  <Avatar
                    name={reaction.sender_profile?.name}
                    avatarUrl={reaction.sender_profile?.avatar_url}
                    size={44}
                  />
                </View>
                <View style={styles.notifBody}>
                  <View style={styles.notifTopRow}>
                    <Text
                      style={[styles.notifName, { color: nameColor }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {formatDisplayName(reaction.sender_profile?.name)}
                    </Text>
                    <Text style={[styles.notifTime, { color: timeColor }]}>
                      {timeAgo(reaction.created_at)}
                    </Text>
                  </View>
                  <View style={styles.notifMessageRow}>
                    <View style={styles.notifLeadSlot}>
                      {lead ? (
                        <Text style={[styles.notifLeadEmoji, isRead && styles.readMutedEmoji]}>{lead}</Text>
                      ) : null}
                    </View>
                    <Text
                      style={[styles.notifMessage, { color: subColor }]}
                      numberOfLines={3}
                    >
                      {text}
                    </Text>
                  </View>
                  {reaction.reaction_type === '🎮' && reaction.message && (
                    <Pressable
                      style={[
                        styles.joinQuizBtn,
                        { backgroundColor: theme.primary },
                        isRead && { opacity: 0.55 },
                      ]}
                      onPress={() => {
                        const sessionId = reaction.message?.match(/session:(\S+)/)?.[1];
                        if (sessionId) {
                          router.push({ pathname: '/match-lobby', params: { sessionId } } as any);
                        }
                      }}
                    >
                      <Feather name="play" size={12} color="#fff" />
                      <Text style={styles.joinQuizBtnText}>Join Quiz</Text>
                    </Pressable>
                  )}
                </View>
                {!reaction.read && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
              </Pressable>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 12,
  },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  clearHeaderBtn: {
    minWidth: 56,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearHeaderBtnText: { fontSize: 14, fontWeight: '700' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 8 },

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
  notifBody: { flex: 1, minWidth: 0 },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  notifName: { fontSize: 15, fontWeight: '700', flex: 1, minWidth: 0 },
  notifTime: { fontSize: 12, fontWeight: '600', flexShrink: 0, marginTop: 2 },
  notifMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    gap: 4,
  },
  notifLeadSlot: {
    width: 28,
    minHeight: 22,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 1,
  },
  notifLeadEmoji: { fontSize: 17, lineHeight: 22 },
  readMutedEmoji: { opacity: 0.55 },
  avatarDim: { opacity: 0.65 },
  notifMessage: { fontSize: 14, lineHeight: 21, flex: 1, minWidth: 0, fontWeight: '500' },
  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 240 },

  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  shareRequestCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  shareActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  shareAcceptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
  },
  shareActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  shareDeclineBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1,
  },
  shareDeclineText: { fontSize: 13, fontWeight: '600' },
  joinQuizBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginTop: 8, alignSelf: 'flex-start',
  },
  joinQuizBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
