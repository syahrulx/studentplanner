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
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
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

  // Advanced Filters
  const [filterUniversity, setFilterUniversity] = useState<string | null>(null);
  const [filterCampus, setFilterCampus] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<string | null>(null);

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempUni, setTempUni] = useState('');
  const [tempCampus, setTempCampus] = useState('');
  const [tempDate, setTempDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const activeUni = filterUniversity !== null ? filterUniversity : userUni;

  const loadPosts = useCallback(async () => {
    try {
      const data = await eventsApi.fetchPosts({
        postType: filter,
        universityId: activeUni,
        campus: filterCampus,
        date: filterDate,
      });
      setPosts(data);
    } catch (e) {
      console.error('[EventsBoard] fetchPosts error:', e);
    }
  }, [filter, activeUni, filterCampus, filterDate]);

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
    const isOwn = item.author_id === user?.id;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border },
          pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
        ]}
        onPress={() => {
          if (isOwn) {
            router.push({ pathname: '/community/create-post', params: { editId: item.id } } as any);
          } else {
            router.push({ pathname: '/community/post-detail', params: { postId: item.id } } as any);
          }
        }}
      >
        {/* Own post indicator */}
        {isOwn && (
          <View style={[styles.ownBadge, { backgroundColor: theme.primary + '15' }]}>
            <Feather name="edit-2" size={10} color={theme.primary} />
            <Text style={[styles.ownBadgeText, { color: theme.primary }]}>Your Post</Text>
          </View>
        )}
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
        <Pressable
          style={[
            styles.filterPill,
            { backgroundColor: theme.card, borderColor: theme.border },
            (filterCampus || filterDate || filterUniversity !== null) && { borderColor: theme.primary, borderWidth: 1 }
          ]}
          onPress={() => {
            setTempUni(filterUniversity !== null ? filterUniversity : (userUni || ''));
            setTempCampus(filterCampus || '');
            setTempDate(filterDate);
            setShowFilterModal(true);
          }}
        >
          <Feather name="filter" size={13} color={theme.primary} />
          <Text style={[styles.filterPillText, { color: theme.primary }]}>Filters</Text>
        </Pressable>
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
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No posts yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                Be the first to share an event or service with your university community!
              </Text>
            </View>
          }
        />
      )}

      {/* Advanced Filter Modal */}
      <Modal visible={showFilterModal} animationType="slide" transparent={true} onRequestClose={() => setShowFilterModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Filter Events</Text>
              <Pressable onPress={() => setShowFilterModal(false)} hitSlop={10}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>University (UiTM)</Text>
            <TextInput
              style={[styles.inputField, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
              value={tempUni}
              onChangeText={setTempUni}
              placeholder="e.g. uitm"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Campus</Text>
            <TextInput
              style={[styles.inputField, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
              value={tempCampus}
              onChangeText={setTempCampus}
              placeholder="e.g. Puncak Alam"
              placeholderTextColor={theme.textSecondary}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Event Date</Text>
            
            {Platform.OS === 'ios' && showDatePicker ? (
              <View style={{ backgroundColor: theme.card, borderRadius: 12, marginTop: 8, overflow: 'hidden' }}>
                <DateTimePicker
                  value={tempDate ? new Date(tempDate) : new Date()}
                  mode="date"
                  display="spinner"
                  onChange={(event, selectedDate) => {
                    if (selectedDate) setTempDate(selectedDate.toISOString().split('T')[0]);
                  }}
                />
                <Pressable style={styles.iosDateDone} onPress={() => setShowDatePicker(false)}>
                  <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 16 }}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Pressable
                  style={[styles.dateButton, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Feather name="calendar" size={16} color={theme.primary} />
                  <Text style={{ color: tempDate ? theme.text : theme.textSecondary, marginLeft: 8 }}>
                    {tempDate ? tempDate : 'Select a date...'}
                  </Text>
                </Pressable>
                {tempDate && (
                  <Pressable onPress={() => setTempDate(null)} hitSlop={10}>
                    <Feather name="trash-2" size={20} color={theme.danger || '#ef4444'} />
                  </Pressable>
                )}
              </View>
            )}

            {Platform.OS === 'android' && showDatePicker && (
              <DateTimePicker
                value={tempDate ? new Date(tempDate) : new Date()}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (event.type === 'set' && selectedDate) {
                    setTempDate(selectedDate.toISOString().split('T')[0]);
                  }
                }}
              />
            )}

            <View style={styles.modalFooter}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => {
                  setFilterUniversity(null);
                  setFilterCampus(null);
                  setFilterDate(null);
                  setShowFilterModal(false);
                }}
              >
                <Text style={{ color: theme.text }}>Reset</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  setFilterUniversity(tempUni.trim() ? tempUni.trim() : null);
                  setFilterCampus(tempCampus.trim() ? tempCampus.trim() : null);
                  setFilterDate(tempDate);
                  setShowFilterModal(false);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  ownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomRightRadius: 12,
  },
  ownBadgeText: { fontSize: 10, fontWeight: '700' },
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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  inputField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flex: 1,
  },
  iosDateDone: { alignSelf: 'flex-end', marginTop: 10, marginBottom: 10, paddingHorizontal: 10 },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
