import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import * as confessionsApi from '@/src/lib/confessionsApi';
import type { Confession } from '@/src/lib/confessionsApi';
import * as eventsApi from '@/src/lib/eventsApi';
import type { Campus } from '@/src/lib/eventsApi';

const PAGE_SIZE = 20;
const MAX_CONTENT = 500;

export const CONFESSION_TAGS = ['🔥 All', '☕️ Tea', '❤️ Crush', '📚 Rant', '❓ Advice'];
export const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '🔥'];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

function getTopReactions(counts: Record<string, number> | undefined) {
  if (!counts) return [];
  const entries = Object.entries(counts).filter(([_, c]) => c > 0);
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, 3).map(e => e[0]);
}

// Apple iOS Segmented Control styled horizontally scrolling filter
function AppleSegmentedFilter({ items, activeItem, onSelect, theme, renderLabel }: any) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.segmentedScroll}>
      <View style={[s.segmentedTrack, { backgroundColor: theme.backgroundSecondary }]}>
        {items.map((item: any) => {
          const isActive = activeItem === item;
          return (
            <Pressable
              key={item === null ? 'null-key' : item}
              onPress={() => {
                if (!isActive) Haptics.selectionAsync().catch(() => {});
                onSelect(item);
              }}
              style={[
                s.segmentedTab,
                isActive && [s.segmentedTabActive, { backgroundColor: theme.card, shadowColor: '#000' }]
              ]}
            >
              <Text style={[
                s.segmentedTabText,
                { color: isActive ? theme.text : theme.textSecondary, fontWeight: isActive ? '600' : '500' }
              ]}>
                {renderLabel ? renderLabel(item) : item}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export default function ConfessionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, language } = useApp();
  const T = useTranslations(language);

  const userUni = (user as any)?.universityId ?? null;
  const universityName = (user as any)?.university?.trim() || userUni || '';
  const userCampus: string | null = ((user as any)?.campus ?? '').trim() || null;

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>('🔥 All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const [items, setItems] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftTag, setDraftTag] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hiddenIdsRef = useRef<Set<string>>(new Set());

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = searchQuery.trim();
      if (activeSearch !== trimmed) {
        setActiveSearch(trimmed);
        setItems([]);
        setHasMore(true);
        setLoading(true);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [searchQuery, activeSearch]);

  useEffect(() => {
    if (!userUni) return;
    eventsApi.fetchCampuses(userUni).then((list) => {
      setCampuses(list);
      if (list.length > 1 && userCampus) {
        const match = list.find((c) => c.name === userCampus);
        if (match) setSelectedCampus(match.name);
      }
    }).catch(() => {});
  }, [userUni, userCampus]);

  const loadFeed = useCallback(async () => {
    if (!userUni) { setItems([]); setLoading(false); setRefreshing(false); return; }
    try {
      const tagQuery = selectedTag === '🔥 All' ? null : selectedTag;
      const data = await confessionsApi.fetchConfessions({ limit: PAGE_SIZE, campus: selectedCampus, tag: tagQuery, search: activeSearch || null });
      setItems(data.filter((c) => !hiddenIdsRef.current.has(c.id)));
      setHasMore(data.length >= PAGE_SIZE);
    } catch (e) { if (__DEV__) console.warn('[Confessions] load error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [userUni, selectedCampus, selectedTag, activeSearch]);

  const loadMore = useCallback(async () => {
    if (!userUni || loadingMore || !hasMore || items.length === 0) return;
    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      const tagQuery = selectedTag === '🔥 All' ? null : selectedTag;
      const data = await confessionsApi.fetchConfessions({ before: last.created_at, limit: PAGE_SIZE, campus: selectedCampus, tag: tagQuery, search: activeSearch || null });
      const filtered = data.filter((c) => !hiddenIdsRef.current.has(c.id));
      setItems((prev) => { const seen = new Set(prev.map((p) => p.id)); return [...prev, ...filtered.filter((r) => !seen.has(r.id))]; });
      setHasMore(data.length >= PAGE_SIZE);
    } catch (e) { if (__DEV__) console.warn('[Confessions] loadMore error:', e); }
    finally { setLoadingMore(false); }
  }, [userUni, loadingMore, hasMore, items, selectedCampus, selectedTag, activeSearch]);

  useFocusEffect(useCallback(() => { setLoading(true); void loadFeed(); }, [loadFeed]));

  const handleRefresh = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setRefreshing(true); void loadFeed(); };

  const handleReaction = async (item: Confession, reaction: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Derive the delta and rollback snapshot from live state (inside the
    // updater), not the `item` closure — a rapid double-tap before re-render
    // would otherwise apply the same stale my_reaction/like_count twice.
    let prevReaction: string | null = item.my_reaction ?? null;
    let prevLikeCount = item.like_count;
    setItems((prev) => prev.map((c) => {
      if (c.id !== item.id) return c;
      prevReaction = c.my_reaction ?? null;
      prevLikeCount = c.like_count;
      const wasReacted = !!c.my_reaction;
      const isAdding = !!reaction;
      let n = c.like_count;
      if (wasReacted && !isAdding) n = Math.max(0, n - 1);
      if (!wasReacted && isAdding) n += 1;
      return { ...c, my_reaction: reaction, like_count: n };
    }));
    if (activeReactionPicker === item.id) setActiveReactionPicker(null);
    try { await confessionsApi.setConfessionReaction(item.id, reaction); }
    catch (e: any) {
      Alert.alert('Error', e.message || 'Failed');
      setItems((prev) => prev.map((c) => c.id === item.id ? { ...c, my_reaction: prevReaction, like_count: prevLikeCount } : c));
    }
  };

  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const created = await confessionsApi.createConfession(text, draftTag);
      const campusMatch = selectedCampus === null || created.campus === selectedCampus || created.campus === null;
      const tagMatch = selectedTag === '🔥 All' || created.tag === selectedTag;
      if (campusMatch && tagMatch) setItems((p) => [created, ...p]);
      setDraft(''); setDraftTag(null); setComposerOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) { Alert.alert(T('error'), e?.message || T('confessionPostError')); }
    finally { setSubmitting(false); }
  };

  const campusShort = (name: string) => name.replace(/^.+?kampus\s+/i, '').replace(/^.+?campus\s+/i, '') || name;
  const showCampusFilter = campuses.length > 1;

  const getTagColor = (tag: string | null) => {
    if (tag === '☕️ Tea') return '#F59E0B'; // Amber
    if (tag === '❤️ Crush') return '#EC4899'; // Pink
    if (tag === '📚 Rant') return '#EF4444'; // Red
    if (tag === '❓ Advice') return '#3B82F6'; // Blue
    return '#8B5CF6'; // Purple
  };

  /* ── Vibrant iOS Style Card ── */
  const renderCard = ({ item }: { item: Confession }) => {
    const isPickerOpen = activeReactionPicker === item.id;
    const reacted = !!item.my_reaction;

    return (
      <View style={s.cardWrapper}>
        {isPickerOpen && (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={s.reactionBubbleContainer}>
            <View style={[s.reactionBubble, { backgroundColor: theme.card + 'F0', borderColor: theme.border }]}>
              {REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPressIn={() => void handleReaction(item, emoji)}
                  style={({ pressed }) => [s.reactionBubbleBtn, pressed && { transform: [{ scale: 1.3 }], backgroundColor: theme.primary + '20' }]}
                >
                  <Text style={s.reactionBubbleEmoji}>{emoji}</Text>
                </Pressable>
              ))}
              <Pressable onPressIn={() => { Haptics.selectionAsync().catch(() => {}); setActiveReactionPicker(null); }} style={s.reactionBubbleClose}>
                <Feather name="x" size={16} color={theme.textSecondary} />
              </Pressable>
            </View>
          </Animated.View>
        )}

        <Pressable
          style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => router.push({ pathname: '/community/confession-detail', params: { confessionId: item.id } } as any)}
        >
          {/* Vibrant Card Top Row */}
          <View style={s.cardMetaRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.anonAvatar, { backgroundColor: getTagColor(item.tag) + '15' }]}>
                <Feather name="user" size={16} color={getTagColor(item.tag)} />
              </View>
              <View>
                <Text style={[s.metaText, { color: getTagColor(item.tag), fontWeight: '800', fontSize: 14 }]}>
                  {item.tag || 'Anon'}
                </Text>
                <Text style={[s.headerSub, { color: theme.textSecondary, marginTop: 0 }]}>{timeAgo(item.created_at)}</Text>
              </View>
            </View>
            
            <View style={s.cardMetaRight}>
              {item.is_mine && (
                <View style={[s.youBadge, { backgroundColor: theme.primary + '15' }]}>
                  <Text style={[s.youBadgeText, { color: theme.primary }]}>You</Text>
                </View>
              )}
            </View>
          </View>

          {/* Confession text */}
          <Text style={[s.contentText, { color: theme.text }]}>{item.content}</Text>

          {/* Bottom Action Row */}
          <View style={s.cardBottomRow}>
            <Pressable
              style={s.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                router.push({ pathname: '/community/confession-detail', params: { confessionId: item.id } } as any);
              }}
            >
              <View style={[s.actionIconWrap, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="message-circle" size={15} color={theme.textSecondary} />
              </View>
              {item.comment_count > 0 && <Text style={[s.actionLabel, { color: theme.textSecondary }]}>{item.comment_count}</Text>}
            </Pressable>

            <Pressable
              style={[
                s.upvotePill, 
                reacted ? { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' } : { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }
              ]}
              onPress={(e) => { e.stopPropagation?.(); void handleReaction(item, reacted ? null : '❤️'); }}
              onLongPress={(e) => {
                e.stopPropagation?.();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
                setActiveReactionPicker(isPickerOpen ? null : item.id);
              }}
              delayLongPress={200}
            >
              {reacted ? (
                <Text style={s.upvoteReactedEmoji}>{item.my_reaction}</Text>
              ) : (
                item.like_count > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 2 }}>
                    {getTopReactions(item.reaction_counts).map((r, i) => (
                      <Text key={r} style={{ fontSize: 14, marginLeft: i > 0 ? -4 : 0 }}>{r}</Text>
                    ))}
                  </View>
                ) : (
                  <Feather name="heart" size={14} color={theme.textSecondary} />
                )
              )}
              <Text style={[s.upvoteCount, { color: reacted ? theme.primary : theme.textSecondary }]}>{item.like_count}</Text>
            </Pressable>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* ─── Apple iOS Header ───── */}
      <View style={[s.header, { backgroundColor: theme.background }]}>
        <Pressable onPress={() => router.back()} style={s.headerLeft} hitSlop={12}>
          <Feather name="chevron-left" size={32} color={theme.primary} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: theme.text }]}>Confessions</Text>
          {universityName ? <Text style={[s.headerSub, { color: theme.textSecondary }]} numberOfLines={1}>{universityName}</Text> : null}
        </View>
        {userUni ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              if (isSearchVisible) {
                setSearchQuery('');
              }
              setIsSearchVisible(!isSearchVisible);
            }} hitSlop={12}>
              <Feather name="search" size={22} color={isSearchVisible ? theme.primary : theme.textSecondary} />
            </Pressable>
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setComposerOpen(true); }} hitSlop={12}>
              <Feather name="edit" size={22} color={theme.primary} />
            </Pressable>
          </View>
        ) : <View style={s.headerRight} />}
      </View>

      {/* ─── Search Bar ───── */}
      {isSearchVisible && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[s.searchWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder="Search confessions..."
            placeholderTextColor={theme.textSecondary + '80'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
            autoFocus
          />
        </Animated.View>
      )}

      {/* ─── Apple Segmented Controls ───── */}
      <View style={s.filtersWrapper}>
        {showCampusFilter && (
          <AppleSegmentedFilter
            items={[null, ...campuses.map(c => c.name)]}
            activeItem={selectedCampus}
            onSelect={(c: any) => { setSelectedCampus(c); setItems([]); setHasMore(true); setLoading(true); }}
            theme={theme}
            renderLabel={(c: any) => c === null ? 'All Campuses' : campusShort(c)}
          />
        )}
        <AppleSegmentedFilter
          items={CONFESSION_TAGS}
          activeItem={selectedTag}
          onSelect={(t: any) => { setSelectedTag(t); setItems([]); setHasMore(true); setLoading(true); }}
          theme={theme}
        />
      </View>

      {/* ─── Content ───── */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyEmoji}>💬</Text>
              <Text style={[s.emptyTitle, { color: theme.text }]}>{T('confessionEmptyTitle')}</Text>
              <Text style={[s.emptyBody, { color: theme.textSecondary }]}>{T('confessionEmptyBody')}</Text>
            </View>
          ) : null
        }
        ListFooterComponent={loadingMore || loading ? <ActivityIndicator style={{ marginVertical: 24 }} color={theme.primary} /> : null}
      />

      {/* ─── Compose Modal ───── */}
      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setComposerOpen(false)} />
          </View>
          <View style={[s.modalSheet, { backgroundColor: theme.card }]}>
            <View style={[s.dragHandle, { backgroundColor: theme.border }]} />
            <Text style={[s.composerTitle, { color: theme.text }]}>Spill the tea ☕️</Text>
            {userCampus && (
              <View style={s.composerCampusBanner}>
                <Text style={[s.composerCampusText, { color: theme.textSecondary }]}>
                  Posting to <Text style={{ color: theme.primary, fontWeight: '800' }}>{userCampus}</Text>
                </Text>
              </View>
            )}
            <TextInput
              style={[s.composerInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
              placeholder="What's on your mind? Be nice, mostly. 🤫"
              placeholderTextColor={theme.textSecondary + '80'}
              multiline maxLength={MAX_CONTENT} value={draft} onChangeText={setDraft} autoFocus
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.composerTagScroll} contentContainerStyle={s.composerTagScrollContent}>
              {CONFESSION_TAGS.filter(t => t !== '🔥 All').map((tag) => {
                const isSelected = draftTag === tag;
                return (
                  <Pressable
                    key={tag}
                    style={[
                      s.composerTagBtn,
                      { backgroundColor: isSelected ? theme.primary : theme.backgroundSecondary }
                    ]}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setDraftTag(isSelected ? null : tag); }}
                  >
                    <Text style={[s.composerTagText, { color: isSelected ? theme.textInverse : theme.textSecondary }]}>{tag}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={s.composerFooter}>
              <Text style={[s.charCount, { color: draft.length > MAX_CONTENT * 0.9 ? theme.danger : theme.textSecondary }]}>{draft.length}/{MAX_CONTENT}</Text>
              <View style={s.composerActions}>
                <Pressable onPress={() => setComposerOpen(false)} style={s.cancelBtn}>
                  <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 16 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.submitBtn, { backgroundColor: theme.primary, opacity: draft.trim() ? 1 : 0.4 }]}
                  onPress={() => void handleSubmit()} disabled={!draft.trim() || submitting}
                >
                  {submitting ? <ActivityIndicator color={theme.textInverse} size="small" /> : <Text style={[s.submitText, { color: theme.textInverse }]}>Post</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  /* Apple Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  headerLeft: { width: 60, alignItems: 'center', justifyContent: 'center' },
  headerRight: { width: 60, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4 },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 2, opacity: 0.8 },

  /* Search Bar */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },

  /* Apple Segmented Controls */
  filtersWrapper: { paddingVertical: 12, gap: 12 },
  segmentedScroll: { paddingHorizontal: 16 },
  segmentedTrack: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
  },
  segmentedTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentedTabActive: {
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentedTabText: { fontSize: 14 },

  /* List */
  listContent: { paddingBottom: 120, paddingTop: 8 },

  /* Vibrant Card */
  cardWrapper: { marginHorizontal: 16, marginBottom: 16 },
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  anonAvatar: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, fontWeight: '600' },
  youBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  youBadgeText: { fontSize: 11, fontWeight: '800' },

  contentText: { fontSize: 16, lineHeight: 24, fontWeight: '400', marginBottom: 18, letterSpacing: -0.2 },

  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: -4 },
  actionIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '700' },

  /* Tactile Upvote Pill */
  upvotePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  upvoteReactedEmoji: { fontSize: 15 },
  upvoteTopReactions: { flexDirection: 'row', alignItems: 'center', marginRight: 2 },
  upvoteTopReactionEmoji: { fontSize: 14 },
  upvoteCount: { fontSize: 14, fontWeight: '700' },

  /* Reaction Bubble */
  reactionBubbleContainer: { position: 'absolute', bottom: 44, right: 0, zIndex: 100 },
  reactionBubble: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
  },
  reactionBubbleBtn: { padding: 6, borderRadius: 999 },
  reactionBubbleEmoji: { fontSize: 22 },
  reactionBubbleClose: { padding: 8, marginLeft: 4, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 999 },

  /* Empty */
  emptyWrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 64, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },

  /* Compose Modal */
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: -10 } },
  dragHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  composerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 8 },
  composerCampusBanner: { marginBottom: 12 },
  composerCampusText: { fontSize: 13, fontWeight: '500' },
  composerInput: { minHeight: 120, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, fontSize: 16, textAlignVertical: 'top', lineHeight: 22 },
  composerTagScroll: { maxHeight: 50, marginTop: 16 },
  composerTagScrollContent: { gap: 8, paddingBottom: 4 },
  composerTagBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  composerTagText: { fontSize: 13, fontWeight: '600' },
  composerFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  charCount: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  cancelBtn: { paddingVertical: 12 },
  submitBtn: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 24 },
  submitText: { fontWeight: '700', fontSize: 15 },
});
