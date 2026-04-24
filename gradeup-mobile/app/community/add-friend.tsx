import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

type Tab = 'nearby' | 'incoming' | 'sent';

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
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors[i],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
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
  const inviteFromId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;
  const { userId, incomingRequests, refreshRequests, refreshFriends } = useCommunity();

  const [tab, setTab] = useState<Tab>('nearby');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [suggestions, setSuggestions] = useState<FriendProfile[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<Friendship[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [inviteHandled, setInviteHandled] = useState(false);

  // Map deep-link tab values to the new 3-tab model.
  useEffect(() => {
    if (tabParam === 'incoming') setTab('incoming');
    else if (tabParam === 'outgoing' || tabParam === 'sent') setTab('sent');
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
                  setTab('sent');
                } catch (e: any) {
                  const msg = String(e?.message || '');
                  if (/already friends/i.test(msg)) {
                    Alert.alert('Already friends', 'You are already friends with this user.');
                  } else if (/already sent/i.test(msg)) {
                    Alert.alert('Already sent', 'You already sent a request to this user.');
                    setTab('sent');
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
    setSentIds((prev) => {
      const next = new Set(prev);
      data.forEach((req) => next.add(req.addressee_id));
      return next;
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoadingNearby(true);
    communityApi
      .getSuggestions(userId)
      .then(setSuggestions)
      .catch(console.warn)
      .finally(() => setLoadingNearby(false));
  }, [userId]);

  useEffect(() => {
    void refreshOutgoingRequests();
  }, [refreshOutgoingRequests]);

  // Debounced search — fires whenever the user types ≥ 2 characters.
  useEffect(() => {
    if (!userId) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setLoadingSearch(true);
    const t = setTimeout(async () => {
      try {
        const results = await communityApi.searchUsers(userId, q);
        setSearchResults(results);
      } catch (e) {
        console.warn(e);
      } finally {
        setLoadingSearch(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, userId]);

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
        const msg = e?.message || '';
        if (/duplicate key|already exists/i.test(msg)) {
          setSentIds((prev) => new Set(prev).add(targetId));
          await refreshOutgoingRequests();
        } else {
          Alert.alert(T('commFriendRequestNotSentTitle'), T('commFriendRequestNotSentBody'));
        }
      }
    },
    [userId, refreshOutgoingRequests, refreshRequests, refreshFriends, T],
  );

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
    [refreshRequests, refreshFriends],
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
    [refreshRequests, refreshFriends, T],
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
    [refreshOutgoingRequests, refreshRequests, T],
  );

  const handleShareInvite = useCallback(async () => {
    if (!userId) return;
    const link = communityApi.generateInviteLink(userId);
    try {
      await Share.share({ message: `Add me on Rencana! ${link}`, url: link });
    } catch (e) {
      console.warn(e);
    }
  }, [userId]);

  const searching = searchQuery.trim().length >= 2;

  const tabs: { key: Tab; label: string; count?: number }[] = useMemo(
    () => [
      { key: 'nearby', label: 'Nearby' },
      { key: 'incoming', label: 'Incoming', count: incomingRequests.length },
      { key: 'sent', label: 'Sent', count: outgoingRequests.length },
    ],
    [incomingRequests.length, outgoingRequests.length],
  );

  const renderPerson = (person: FriendProfile) => {
    const isSent = sentIds.has(person.id);
    return (
      <View key={person.id} style={[styles.personRow, { borderBottomColor: theme.border }]}>
        <Avatar name={person.name} avatarUrl={person.avatar_url} size={44} />
        <View style={styles.personInfo}>
          <Text style={[styles.personName, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
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
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Add Friends</Text>
        <Pressable
          onPress={handleShareInvite}
          style={({ pressed }) => [
            styles.inviteHeaderBtn,
            { backgroundColor: theme.primary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Feather name="share" size={14} color="#fff" />
          <Text style={styles.inviteHeaderBtnText}>Invite</Text>
        </Pressable>
      </View>

      {/* Persistent search bar */}
      <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Feather name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search by name"
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Feather name="x" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Segmented tabs — hidden while searching */}
      {!searching && (
        <View style={[styles.segmented, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[
                  styles.segmentedItem,
                  active && { backgroundColor: theme.primary },
                ]}
              >
                <Text
                  style={[
                    styles.segmentedText,
                    { color: active ? '#fff' : theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {t.label}
                  {typeof t.count === 'number' ? ` · ${t.count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── SEARCH MODE ────────────────────────────────────────── */}
        {searching && (
          <>
            {loadingSearch && (
              <View style={styles.inlineLoader}>
                <ActivityIndicator color={theme.primary} />
              </View>
            )}
            {!loadingSearch && searchResults.length === 0 && (
              <View style={[styles.inlineEmpty, { borderColor: theme.border }]}>
                <Feather name="search" size={20} color={theme.textSecondary} />
                <Text style={[styles.inlineEmptyText, { color: theme.textSecondary }]}>
                  No results for &quot;{searchQuery.trim()}&quot;. Try a different name.
                </Text>
              </View>
            )}
            {searchResults.map(renderPerson)}
          </>
        )}

        {/* ── NEARBY ─────────────────────────────────────────────── */}
        {!searching && tab === 'nearby' && (
          <>
            <Pressable
              onPress={handleShareInvite}
              style={({ pressed }) => [
                styles.inviteCard,
                { backgroundColor: theme.primary + '14', borderColor: theme.primary + '33' },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={[styles.inviteIconWrap, { backgroundColor: theme.primary }]}>
                <Feather name="share-2" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inviteTitle, { color: theme.text }]}>Invite a friend</Text>
                <Text style={[styles.inviteSub, { color: theme.textSecondary }]} numberOfLines={2}>
                  Share a link so they land on your profile.
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            </Pressable>

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
              People near you{loadingNearby ? '…' : ''}
            </Text>

            {loadingNearby && suggestions.length === 0 && (
              <View style={styles.inlineLoader}>
                <ActivityIndicator color={theme.primary} />
              </View>
            )}
            {!loadingNearby && suggestions.length === 0 && (
              <View style={[styles.inlineEmpty, { borderColor: theme.border }]}>
                <Feather name="users" size={20} color={theme.textSecondary} />
                <Text style={[styles.inlineEmptyText, { color: theme.textSecondary }]}>
                  No one nearby yet. Invite someone or search by name above.
                </Text>
              </View>
            )}
            {suggestions.map(renderPerson)}
          </>
        )}

        {/* ── INCOMING ───────────────────────────────────────────── */}
        {!searching && tab === 'incoming' && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Incoming requests</Text>
            {incomingRequests.length === 0 ? (
              <View style={[styles.inlineEmpty, { borderColor: theme.border }]}>
                <Feather name="inbox" size={20} color={theme.textSecondary} />
                <Text style={[styles.inlineEmptyText, { color: theme.textSecondary }]}>
                  No incoming requests right now.
                </Text>
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
                      <Text style={[styles.personSub, { color: theme.textSecondary }]} numberOfLines={1}>
                        {req.profile.university}
                      </Text>
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

        {/* ── SENT ───────────────────────────────────────────────── */}
        {!searching && tab === 'sent' && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Sent requests</Text>
            {outgoingRequests.length === 0 ? (
              <View style={[styles.inlineEmpty, { borderColor: theme.border }]}>
                <Feather name="send" size={20} color={theme.textSecondary} />
                <Text style={[styles.inlineEmptyText, { color: theme.textSecondary }]}>
                  You haven&apos;t sent any requests yet.
                </Text>
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
                      {[req.addressee_profile?.university, req.addressee_profile?.course]
                        .filter(Boolean)
                        .join(' · ') || 'Waiting for response'}
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
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 8,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  inviteHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  inviteHeaderBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },

  segmented: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  segmentedItem: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedText: { fontSize: 13, fontWeight: '700' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 10 },

  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  inviteIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteTitle: { fontSize: 14, fontWeight: '700' },
  inviteSub: { fontSize: 12, marginTop: 2 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 6,
  },

  inlineLoader: { paddingVertical: 20, alignItems: 'center' },
  inlineEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  inlineEmptyText: { flex: 1, fontSize: 13, lineHeight: 18 },

  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  personInfo: { flex: 1, minWidth: 0 },
  personName: { fontSize: 15, fontWeight: '700' },
  personSub: { fontSize: 12, marginTop: 2 },

  requestActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  acceptBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  declineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  declineBtnText: { fontSize: 13, fontWeight: '600' },

  cancelOutgoingBtn: {
    minWidth: 74,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelOutgoingBtnText: { fontSize: 13, fontWeight: '700' },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexShrink: 0,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  sentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    flexShrink: 0,
  },
  sentBadgeText: { fontSize: 12, fontWeight: '600' },
});
