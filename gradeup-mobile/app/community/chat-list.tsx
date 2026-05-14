import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { Avatar } from '@/components/Avatar';
import * as dmApi from '@/src/lib/dmApi';
import type { DmConversation } from '@/src/lib/dmApi';
import type { FriendProfile } from '@/src/lib/communityApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function lastMessagePreview(convo: DmConversation, userId: string): string {
  const msg = convo.last_message;
  if (!msg) return 'No messages yet';
  const isMe = msg.sender_id === userId;
  const prefix = isMe ? 'You: ' : '';
  if (msg.message_type === 'flashcard_share') return `${prefix}📇 Shared flashcards`;
  if (msg.message_type === 'quiz_share') return `${prefix}🎯 Shared a quiz`;
  const text = msg.content || '';
  return `${prefix}${text.length > 40 ? text.slice(0, 40) + '…' : text}`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ChatListScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const { userId } = useCommunity();

  const isPro = user.subscriptionPlan === 'pro';

  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [proFriends, setProFriends] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId || !isPro) {
      setLoading(false);
      return;
    }
    try {
      const [convos, friends] = await Promise.all([
        dmApi.getConversations(userId),
        dmApi.getProFriends(userId),
      ]);
      setConversations(convos);
      setProFriends(friends);
    } catch (e: any) {
      if (__DEV__) console.warn('[ChatList] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, isPro]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData]),
  );

  const handleStartChat = async (friend: FriendProfile) => {
    if (!userId) return;
    setShowNewChat(false);
    try {
      const convo = await dmApi.getOrCreateConversation(userId, friend.id);
      router.push({
        pathname: '/community/chat-room',
        params: {
          conversationId: convo.id,
          friendId: friend.id,
          friendName: friend.name,
          friendAvatar: friend.avatar_url || '',
        },
      } as any);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not start conversation');
    }
  };

  const handleOpenConvo = (convo: DmConversation) => {
    const friendId = convo.user_a === userId ? convo.user_b : convo.user_a;
    router.push({
      pathname: '/community/chat-room',
      params: {
        conversationId: convo.id,
        friendId,
        friendName: convo.friend?.name || 'Friend',
        friendAvatar: convo.friend?.avatar_url || '',
      },
    } as any);
  };

  // ─── Pro-locked state ───
  if (!isPro) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={[styles.nav, { paddingTop: insets.top + 8, borderBottomColor: theme.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Feather name="chevron-left" size={28} color={theme.text} />
          </Pressable>
          <Text style={[styles.navTitle, { color: theme.text }]}>Messages</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.lockedContainer}>
          <View style={[styles.lockedIconWrap, { backgroundColor: theme.primary + '15' }]}>
            <Feather name="lock" size={40} color={theme.primary} />
          </View>
          <Text style={[styles.lockedTitle, { color: theme.text }]}>Pro Feature</Text>
          <Text style={[styles.lockedDesc, { color: theme.textSecondary }]}>
            Direct messaging is available exclusively for Pro subscribers. Upgrade your plan to chat
            with friends, share flashcards, and quiz together.
          </Text>
          <Pressable
            onPress={() => router.push('/subscription-plans' as any)}
            style={({ pressed }) => [pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[theme.primary, theme.accent2 || theme.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.upgradeBtn}
            >
              <Feather name="zap" size={18} color="#fff" />
              <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Conversations list ───
  const renderConversation = ({ item }: { item: DmConversation }) => {
    const hasUnread = (item.unread_count || 0) > 0;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.convoRow,
          { backgroundColor: pressed ? theme.backgroundSecondary : 'transparent' },
        ]}
        onPress={() => handleOpenConvo(item)}
      >
        <View style={styles.convoAvatarWrap}>
          <Avatar name={item.friend?.name} avatarUrl={item.friend?.avatar_url} size={48} />
          {hasUnread && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
        </View>
        <View style={styles.convoContent}>
          <Text style={[styles.convoName, { color: theme.text }]} numberOfLines={1}>
            {item.friend?.name || 'Unknown'}
          </Text>
          <Text
            style={[
              styles.convoPreview,
              { color: hasUnread ? theme.text : theme.textSecondary },
              hasUnread && { fontWeight: '600' },
            ]}
            numberOfLines={1}
          >
            {lastMessagePreview(item, userId!)}
          </Text>
        </View>
        <Text style={[styles.convoTime, { color: theme.textSecondary }]}>
          {timeAgo(item.last_message?.created_at || item.last_message_at)}
        </Text>
      </Pressable>
    );
  };

  // Filter out friends that already have conversations for "new chat" picker
  const existingFriendIds = new Set(
    conversations.map((c) => (c.user_a === userId ? c.user_b : c.user_a)),
  );
  const newChatFriends = proFriends.filter((f) => !existingFriendIds.has(f.id));

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Nav */}
      <View style={[styles.nav, { paddingTop: insets.top + 8, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Feather name="chevron-left" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.navTitle, { color: theme.text }]}>Messages</Text>
        <Pressable
          onPress={() => setShowNewChat((v) => !v)}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Feather name="edit" size={22} color={theme.primary} />
        </Pressable>
      </View>

      {/* New chat picker */}
      {showNewChat && (
        <View style={[styles.newChatPanel, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <Text style={[styles.newChatTitle, { color: theme.textSecondary }]}>START A NEW CHAT</Text>
          {newChatFriends.length === 0 ? (
            <Text style={[styles.newChatEmpty, { color: theme.textSecondary }]}>
              {proFriends.length === 0
                ? 'No Pro friends found. Only Pro subscribers can chat.'
                : 'You already have conversations with all your Pro friends.'}
            </Text>
          ) : (
            newChatFriends.map((friend) => (
              <Pressable
                key={friend.id}
                style={({ pressed }) => [
                  styles.newChatRow,
                  pressed && { backgroundColor: theme.backgroundSecondary },
                ]}
                onPress={() => handleStartChat(friend)}
              >
                <Avatar name={friend.name} avatarUrl={friend.avatar_url} size={36} />
                <Text style={[styles.newChatName, { color: theme.text }]} numberOfLines={1}>
                  {friend.name}
                </Text>
                <Feather name="message-circle" size={18} color={theme.primary} />
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* Conversation list */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      ) : conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.primary + '12' }]}>
            <Feather name="message-circle" size={36} color={theme.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No conversations yet</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            Start chatting with your Pro friends — share flashcards, quiz together, and more.
          </Text>
          <Pressable
            onPress={() => setShowNewChat(true)}
            style={({ pressed }) => [
              styles.emptyBtn,
              { backgroundColor: theme.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather name="edit" size={16} color="#fff" />
            <Text style={styles.emptyBtnText}>New Message</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          renderItem={renderConversation}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },

  // Locked state
  lockedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  lockedIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  lockedTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
  lockedDesc: { fontSize: 15, fontWeight: '500', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
  },
  upgradeBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // New chat panel
  newChatPanel: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newChatTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  newChatEmpty: { fontSize: 13, fontWeight: '500', paddingBottom: 8 },
  newChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  newChatName: { flex: 1, fontSize: 15, fontWeight: '600' },

  // Conversation rows
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  convoAvatarWrap: { position: 'relative' },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#000',
  },
  convoContent: { flex: 1, minWidth: 0 },
  convoName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  convoPreview: { fontSize: 13, fontWeight: '400' },
  convoTime: { fontSize: 12, fontWeight: '500' },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptyDesc: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
