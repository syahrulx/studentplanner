import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';
import type { CommunityPost, PostType } from '@/src/lib/eventsApi';

const { width: SW } = Dimensions.get('window');

const TYPE_PILLS: { label: string; value: PostType | null; icon: string }[] = [
  { label: 'All', value: null, icon: 'grid' },
  { label: 'Events', value: 'event', icon: 'calendar' },
  { label: 'Services', value: 'service', icon: 'tool' },
  { label: 'Memos', value: 'memo', icon: 'file-text' },
];

const TYPE_BADGE: Record<PostType, { label: string; emoji: string; color: string }> = {
  event: { label: 'Event', emoji: '📅', color: '#3b82f6' },
  service: { label: 'Service', emoji: '🔧', color: '#f59e0b' },
  memo: { label: 'Memo', emoji: '📋', color: '#8b5cf6' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function EventsBoard() {
  const theme = useTheme();
  const { user } = useApp();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<PostType | null>(null);
  const [authorityStatus, setAuthorityStatus] = useState<string | null>(null);

  const userUni = (user as any)?.university_id || (user as any)?.universityId || null;
  const userCampus = (user as any)?.campus || null;

  const loadPosts = useCallback(async () => {
    try {
      const data = await eventsApi.fetchPosts({
        postType: filter,
        universityId: userUni,
      });
      setPosts(data);
    } catch (e) {
      console.error('[EventsBoard] fetchPosts error:', e);
    }
  }, [filter, userUni]);

  const loadAuthority = useCallback(async () => {
    const status = await eventsApi.getMyAuthorityStatus();
    setAuthorityStatus(status);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([loadPosts(), loadAuthority()]).finally(() => setLoading(false));
    }, [loadPosts, loadAuthority])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }, [loadPosts]);

  const renderCard = useCallback(({ item }: { item: CommunityPost }) => {
    const badge = TYPE_BADGE[item.post_type];
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border },
          pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
        ]}
        onPress={() => router.push({ pathname: '/community/post-detail', params: { postId: item.id } } as any)}
      >
        {/* Pinned badge */}
        {item.pinned && (
          <View style={[styles.pinnedBadge, { backgroundColor: theme.primary + '15' }]}>
            <Text style={{ fontSize: 10 }}>📌</Text>
            <Text style={[styles.pinnedText, { color: theme.primary }]}>Pinned</Text>
          </View>
        )}

        {/* Image */}
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.cardImage} resizeMode="cover" />
        ) : null}

        {/* Header: badge + time */}
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: badge.color + '18' }]}>
            <Text style={{ fontSize: 11 }}>{badge.emoji}</Text>
            <Text style={[styles.typeBadgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
          <Text style={[styles.cardTime, { color: theme.textSecondary }]}>{timeAgo(item.created_at)}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
          {item.title}
        </Text>

        {/* Body preview */}
        {item.body ? (
          <Text style={[styles.cardBody, { color: theme.textSecondary }]} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}

        {/* Meta row: date, location, author */}
        <View style={styles.cardMeta}>
          {item.event_date ? (
            <View style={styles.metaItem}>
              <Feather name="calendar" size={11} color={theme.primary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {item.event_date}{item.event_time ? ` · ${item.event_time}` : ''}
              </Text>
            </View>
          ) : null}
          {item.location ? (
            <View style={styles.metaItem}>
              <Feather name="map-pin" size={11} color={theme.primary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Author */}
        <View style={styles.cardAuthor}>
          <View style={[styles.authorDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.authorName, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.author_name}
          </Text>
          {item.university_id ? (
            <Text style={[styles.authorUni, { color: theme.textSecondary }]} numberOfLines={1}>
              · {item.university_id.toUpperCase()}
              {item.campus ? ` ${item.campus}` : ''}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }, [theme]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Filter pills */}
      <View style={styles.filterBar}>
        {TYPE_PILLS.map((pill) => {
          const active = filter === pill.value;
          return (
            <Pressable
              key={pill.label}
              style={[
                styles.filterPill,
                {
                  backgroundColor: active ? theme.primary : theme.card,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setFilter(pill.value)}
            >
              <Feather name={pill.icon as any} size={13} color={active ? '#fff' : theme.textSecondary} />
              <Text style={[styles.filterPillText, { color: active ? '#fff' : theme.textSecondary }]}>
                {pill.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Posts list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48 }}>📋</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No posts yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                Be the first to share an event or service with your university community!
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.primary },
          pressed && { opacity: 0.85, transform: [{ scale: 0.92 }] },
        ]}
        onPress={() => router.push('/community/create-post' as any)}
      >
        <Feather name="plus" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Filters
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: { fontSize: 13, fontWeight: '600' },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },

  // Card
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 180,
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomRightRadius: 12,
  },
  pinnedText: { fontSize: 10, fontWeight: '700' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  cardTime: { fontSize: 11, fontWeight: '500' },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingTop: 8,
    lineHeight: 22,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, fontWeight: '500' },
  cardAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  authorDot: { width: 6, height: 6, borderRadius: 3 },
  authorName: { fontSize: 12, fontWeight: '600' },
  authorUni: { fontSize: 11, fontWeight: '500' },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
});
