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
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useCommunity } from '@/src/context/CommunityContext';
import * as communityApi from '@/src/lib/communityApi';
import type { QuickReaction } from '@/src/lib/communityApi';

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

export default function NotificationsScreen() {
  const theme = useTheme();
  const { userId, refreshUnreadCount, incomingSharedTasks, respondToShare, refreshSharedTasks } = useCommunity();

  const [reactions, setReactions] = useState<QuickReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());

  const handleShareResponse = async (sharedTaskId: string, accept: boolean) => {
    setRespondingIds(prev => new Set(prev).add(sharedTaskId));
    await respondToShare(sharedTaskId, accept);
    setRespondingIds(prev => {
      const next = new Set(prev);
      next.delete(sharedTaskId);
      return next;
    });
  };

  const loadReactions = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await communityApi.getMyReactions(userId);
      setReactions(data);
      // Mark all as read
      await communityApi.markReactionsRead(userId);
      await refreshUnreadCount();
    } catch (e) {
      console.warn(e);
    }
    setLoading(false);
  }, [userId, refreshUnreadCount]);

  useEffect(() => {
    loadReactions();
  }, [loadReactions]);

  const handleReply = useCallback(
    async (reaction: QuickReaction) => {
      if (!userId) return;
      router.push({
        pathname: '/community/friend-profile',
        params: { friendId: reaction.sender_id },
      } as any);
    },
    [userId]
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
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Incoming Shared Task Requests */}
        {incomingSharedTasks.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Task Share Requests</Text>
            {incomingSharedTasks.map(st => (
              <View
                key={st.id}
                style={[styles.shareRequestCard, { backgroundColor: theme.primary + '08', borderColor: theme.primary + '25' }]}
              >
                <Avatar
                  name={st.owner_profile?.name}
                  avatarUrl={st.owner_profile?.avatar_url}
                  size={44}
                />
                <View style={styles.notifBody}>
                  <Text style={[styles.notifName, { color: theme.text }]}>
                    {st.owner_profile?.name || 'Someone'}
                  </Text>
                  <Text style={[styles.notifMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                    Shared a task: {st.task?.title || 'Task'}
                    {st.message ? `\n"${st.message}"` : ''}
                  </Text>
                  <View style={styles.shareActions}>
                    <Pressable
                      style={[styles.shareAcceptBtn, { backgroundColor: '#10b981' }]}
                      disabled={respondingIds.has(st.id)}
                      onPress={() => handleShareResponse(st.id, true)}
                    >
                      <Feather name="check" size={14} color="#fff" />
                      <Text style={styles.shareActionText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.shareDeclineBtn, { borderColor: theme.border }]}
                      disabled={respondingIds.has(st.id)}
                      onPress={() => handleShareResponse(st.id, false)}
                    >
                      <Text style={[styles.shareDeclineText, { color: theme.textSecondary }]}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={theme.primary} />
        ) : reactions.length === 0 && incomingSharedTasks.length === 0 ? (
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
            return (
              <Pressable
                key={reaction.id}
                style={({ pressed }) => [
                  styles.notifCard,
                  {
                    backgroundColor: reaction.read ? theme.card : theme.primary + '08',
                    borderColor: reaction.read ? theme.border : theme.primary + '30',
                  },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => handleReply(reaction)}
              >
                <Avatar
                  name={reaction.sender_profile?.name}
                  avatarUrl={reaction.sender_profile?.avatar_url}
                  size={44}
                />
                <View style={styles.notifBody}>
                  <View style={styles.notifTopRow}>
                    <Text style={[styles.notifName, { color: theme.text }]}>
                      {reaction.sender_profile?.name || 'Someone'}
                    </Text>
                    <Text style={[styles.notifTime, { color: theme.textSecondary }]}>
                      {timeAgo(reaction.created_at)}
                    </Text>
                  </View>
                  <Text style={[styles.notifMessage, { color: theme.textSecondary }]}>
                    {isBump
                      ? '💥 Bumped you!'
                      : reaction.reaction_type === '📋'
                      ? `📋 ${reaction.message || 'Shared a task with you!'}`
                      : reaction.reaction_type === '🎮'
                      ? `🎮 ${reaction.message || 'Invited you to a quiz!'}`
                      : reaction.message
                      ? `${reaction.reaction_type} ${reaction.message}`
                      : `Sent you ${reaction.reaction_type}`}
                  </Text>
                  {reaction.reaction_type === '🎮' && reaction.message && (
                    <Pressable
                      style={[styles.joinQuizBtn, { backgroundColor: theme.primary }]}
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
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 12,
  },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 8 },

  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    position: 'relative',
  },
  notifBody: { flex: 1 },
  notifTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notifName: { fontSize: 15, fontWeight: '700' },
  notifTime: { fontSize: 12, fontWeight: '500' },
  notifMessage: { fontSize: 14, marginTop: 2 },
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
