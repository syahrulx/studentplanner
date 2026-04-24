import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { useTranslations } from '@/src/i18n';
import * as communityApi from '@/src/lib/communityApi';
import type { FriendProfile, Friendship } from '@/src/lib/communityApi';

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, avatarUrl, size = 44 }: { name?: string; avatarUrl?: string; size?: number }) {
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

export default function AddFriendScreen() {
  const theme = useTheme();
  const { language } = useApp();
  const T = useTranslations(language);
  const params = useLocalSearchParams<{ tab?: string | string[]; id?: string | string[] }>();
  const tabParam = typeof params.tab === 'string' ? params.tab : undefined;
  const inviteFromId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;
  const { userId, incomingRequests, refreshRequests, refreshFriends } = useCommunity();

  const [tab, setTab] = useState<'suggestions' | 'search' | 'incoming' | 'outgoing'>('suggestions');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [suggestions, setSuggestions] = useState<FriendProfile[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [inviteHandled, setInviteHandled] = useState(false);

  // Open Incoming / Sent when opened from a notification deep link
  useEffect(() => {
    if (tabParam === 'incoming' || tabParam === 'outgoing') {
      setTab(tabParam);
    }
  }, [tabParam]);

  // Handle deep link invite: rencana://community/add-friend?id=<userId>
  useEffect(() => {
    if (inviteHandled) return;
    if (!userId) return;
    if (!inviteFromId || !inviteFromId.trim()) return;
    const inviterId = inviteFromId.trim();
    if (inviterId === userId) {
      setInviteHandled(true);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const profile = await communityApi.getUserProfile(inviterId).catch(() => null);
        const name = profile?.name?.trim() || 'this user';
        Alert.alert(
          'Add friend?',
          `Do you want to send a friend request to ${name}?`,
          [
            { text: 'Not now', style: 'cancel', onPress: () => alive && setInviteHandled(true) },
            {
              text: 'Add',
              onPress: async () => {
                try {
                  await communityApi.sendFriendRequest(userId, inviterId);
                  setSentIds((prev) => new Set(prev).add(inviterId));
                  await refreshRequests();
                  await refreshFriends();
                  setTab('outgoing');
                } catch (e: any) {
                  const msg = String(e?.message || '');
                  if (/already friends/i.test(msg)) {
                    Alert.alert('Already friends', 'You are already friends with this user.');
                  } else if (/already sent/i.test(msg)) {
                    Alert.alert('Already sent', 'You already sent a request to this user.');
                    setTab('outgoing');
                  } else {
                    Alert.alert(T('commFriendRequestNotSentTitle'), T('commFriendRequestNotSentBody'));
                  }
                } finally {
                  if (alive) setInviteHandled(true);
                }
              },
            },
          ],
        );
      } finally {
        if (alive) setInviteHandled(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [inviteHandled, inviteFromId, refreshFriends, refreshRequests, T, userId]);

  const refreshOutgoingRequests = useCallback(async () => {
    if (!userId) return;
    const data = await communityApi.getOutgoingRequests(userId).catch(() => [] as Friendship[]);
    setOutgoingRequests(data);
    // Pre-populate sentIds so the UI shows "Sent" for already-requested users
    setSentIds(prev => {
      const next = new Set(prev);
      data.forEach(req => next.add(req.addressee_id));
      return next;
    });
  }, [userId]);

  // Load suggestions on mount
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    communityApi
      .getSuggestions(userId)
      .then(setSuggestions)
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [userId]);

  // Load outgoing requests
  useEffect(() => {
    void refreshOutgoingRequests();
  }, [refreshOutgoingRequests]);

  // Search
  const handleSearch = useCallback(async () => {
    if (!userId || !searchQuery.trim()) return;
    setLoading(true);
    try {
      const results = await communityApi.searchUsers(userId, searchQuery);
      setSearchResults(results);
    } catch (e) {
      console.warn(e);
    }
    setLoading(false);
  }, [userId, searchQuery]);

  useEffect(() => {
    if (tab === 'search' && searchQuery.length >= 2) {
      const timeout = setTimeout(handleSearch, 500);
      return () => clearTimeout(timeout);
    }
  }, [searchQuery, tab, handleSearch]);

  // Send friend request
  const handleSendRequest = useCallback(
    async (targetId: string) => {
      if (!userId) return;
      try {
        await communityApi.sendFriendRequest(userId, targetId);
        setSentIds((prev) => new Set(prev).add(targetId));
        await refreshOutgoingRequests();
        await refreshRequests();
        await refreshFriends();
      } catch (e: any) {
        const msg = e.message || '';
        if (/duplicate key|already exists/i.test(msg)) {
          setSentIds((prev) => new Set(prev).add(targetId));
          await refreshOutgoingRequests();
        } else {
          Alert.alert(T('commFriendRequestNotSentTitle'), T('commFriendRequestNotSentBody'));
        }
      }
    },
    [userId, refreshOutgoingRequests, refreshRequests, refreshFriends, T]
  );

  // Accept request
  const handleAccept = useCallback(
    async (friendshipId: string) => {
      try {
        await communityApi.acceptFriendRequest(friendshipId);
        await refreshRequests();
        await refreshFriends();
      } catch (e) {
        console.warn(e);
      }
    },
    [refreshRequests, refreshFriends]
  );

  const handleDeclineIncoming = useCallback(
    async (friendshipId: string) => {
      try {
        await communityApi.removeFriend(friendshipId);
        await refreshRequests();
        await refreshFriends();
      } catch (e) {
        console.warn(e);
        Alert.alert(T('commCouldNotDecline'), T('commTryAgainShort'));
      }
    },
    [refreshRequests, refreshFriends, T]
  );

  const handleCancelOutgoing = useCallback(
    (req: Friendship) => {
      const name = req.addressee_profile?.name || 'this person';
      Alert.alert(T('commFriendCancelTitle'), T('commFriendCancelBody').replace('{name}', name), [
        { text: T('commBtnNo'), style: 'cancel' },
        {
          text: T('commBtnCancelRequest'),
          style: 'destructive',
          onPress: async () => {
            setCancellingIds((p) => new Set(p).add(req.id));
            try {
              await communityApi.removeFriend(req.id);
              setSentIds((prev) => {
                const next = new Set(prev);
                next.delete(req.addressee_id);
                return next;
              });
              await refreshOutgoingRequests();
              await refreshRequests();
            } catch (e) {
              Alert.alert(T('commCouldNotCancel'), T('commTryAgainShort'));
            }
            setCancellingIds((p) => {
              const next = new Set(p);
              next.delete(req.id);
              return next;
            });
          },
        },
      ]);
    },
    [refreshOutgoingRequests, refreshRequests, T]
  );

  // Share invite link
  const handleShareInvite = useCallback(async () => {
    if (!userId) return;
    const link = communityApi.generateInviteLink(userId);
    try {
      await Share.share({
        message: `Add me on Rencana! ${link}`,
        url: link,
      });
    } catch (e) {
      console.warn(e);
    }
  }, [userId]);

  const displayList = tab === 'search' ? searchResults : suggestions;
  const tabs = [
    { key: 'suggestions' as const, label: 'Nearby' },
    { key: 'search' as const, label: 'Search' },
    { key: 'incoming' as const, label: `Incoming (${incomingRequests.length})` },
    { key: 'outgoing' as const, label: `Sent (${outgoingRequests.length})` },
  ];

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
        <Text style={[styles.title, { color: theme.text }]}>Add Friends</Text>
        <Pressable
          onPress={handleShareInvite}
          style={({ pressed }) => [styles.shareBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.8 }]}
        >
          <Feather name="share" size={16} color="#fff" />
          <Text style={styles.shareBtnText}>Invite</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabRow, { borderBottomColor: theme.border }]}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabItem, tab === t.key && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          >
            <Text
              style={[
                styles.tabText,
                { color: tab === t.key ? theme.primary : theme.textSecondary },
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Search bar (only in search tab) */}
      {tab === 'search' && (
        <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="search" size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by name..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Feather name="x" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      )}

      {/* Content */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} />}

        {/* Incoming Requests tab */}
        {tab === 'incoming' && (
          <>
            {incomingRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="inbox" size={40} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No incoming requests</Text>
              </View>
            ) : (
              incomingRequests.map((req) => (
                <View key={req.id} style={[styles.personRow, { borderBottomColor: theme.border }]}>
                  <Avatar name={req.profile?.name} avatarUrl={req.profile?.avatar_url} size={44} />
                  <View style={styles.personInfo}>
                    <Text
                      style={[styles.personName, { color: theme.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {req.profile?.name || 'Unknown'}
                    </Text>
                    {req.profile?.university && (
                      <Text style={[styles.personSub, { color: theme.textSecondary }]}>{req.profile.university}</Text>
                    )}
                  </View>
                  <View style={styles.requestActions}>
                    <Pressable
                      style={[styles.acceptBtn, { backgroundColor: theme.primary }]}
                      onPress={() => handleAccept(req.id)}
                    >
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.declineBtn, { borderColor: theme.border }]}
                      onPress={() => handleDeclineIncoming(req.id)}
                    >
                      <Text style={[styles.declineBtnText, { color: theme.textSecondary }]}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* Outgoing Requests tab */}
        {tab === 'outgoing' && (
          <>
            {outgoingRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="send" size={40} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No sent requests</Text>
              </View>
            ) : (
              outgoingRequests.map((req) => (
                <View key={req.id} style={[styles.personRow, { borderBottomColor: theme.border }]}>
                  <Avatar
                    name={req.addressee_profile?.name}
                    avatarUrl={req.addressee_profile?.avatar_url}
                    size={44}
                  />
                  <View style={styles.personInfo}>
                    <Text
                      style={[styles.personName, { color: theme.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {req.addressee_profile?.name || 'Unknown'}
                    </Text>
                    <Text style={[styles.personSub, { color: theme.textSecondary }]} numberOfLines={1}>
                      {[req.addressee_profile?.university, req.addressee_profile?.course].filter(Boolean).join(' · ') ||
                        'Waiting for response'}
                    </Text>
                  </View>
                  <Pressable
                    disabled={cancellingIds.has(req.id)}
                    style={({ pressed }) => [
                      styles.cancelOutgoingBtn,
                      { borderColor: theme.border },
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => handleCancelOutgoing(req)}
                  >
                    {cancellingIds.has(req.id) ? (
                      <ActivityIndicator size="small" color={theme.textSecondary} />
                    ) : (
                      <Text style={[styles.cancelOutgoingBtnText, { color: theme.danger }]}>Cancel</Text>
                    )}
                  </Pressable>
                </View>
              ))
            )}
          </>
        )}

        {/* Search/suggestions */}
        {(tab === 'search' || tab === 'suggestions') && (
          <>
            {!loading && displayList.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="users" size={40} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  {tab === 'search'
                    ? searchQuery.length < 2
                      ? 'Type at least 2 characters to search'
                      : 'No users found'
                    : 'No nearby users found'}
                </Text>
              </View>
            )}

            {displayList.map((person) => {
              const isSent = sentIds.has(person.id);
              return (
                <View key={person.id} style={[styles.personRow, { borderBottomColor: theme.border }]}>
                  <Avatar name={person.name} avatarUrl={person.avatar_url} size={44} />
                  <View style={styles.personInfo}>
                    <Text
                      style={[styles.personName, { color: theme.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {person.name}
                    </Text>
                    <Text style={[styles.personSub, { color: theme.textSecondary }]} numberOfLines={1}>
                      {[person.university, person.faculty, person.course].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {isSent ? (
                    <View style={[styles.sentBadge, { backgroundColor: theme.textSecondary + '20' }]}>
                      <Feather name="check" size={14} color={theme.textSecondary} />
                      <Text style={[styles.sentBadgeText, { color: theme.textSecondary }]}>Sent</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [
                        styles.addBtn,
                        { backgroundColor: theme.primary },
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={() => handleSendRequest(person.id)}
                    >
                      <Feather name="user-plus" size={14} color="#fff" />
                      <Text style={styles.addBtnText}>Add</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 60 }} />
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
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  shareBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  tabItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 4,
  },
  tabText: { fontSize: 13, fontWeight: '600' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20 },

  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  personInfo: { flex: 1, minWidth: 0 },
  personName: { fontSize: 16, fontWeight: '700' },
  personSub: { fontSize: 13, marginTop: 2 },

  requestActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  acceptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
  },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  declineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  declineBtnText: { fontSize: 14, fontWeight: '600' },
  cancelOutgoingBtn: {
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelOutgoingBtnText: { fontSize: 14, fontWeight: '700' },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    flexShrink: 0,
  },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  sentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexShrink: 0,
  },
  sentBadgeText: { fontSize: 13, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, fontWeight: '500' },
});
