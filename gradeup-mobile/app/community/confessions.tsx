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
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { ConfessionShareCard } from '@/src/components/confessions/ConfessionShareCard';
import { shareExportCanvas } from '@/components/ViewShotCompat';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import * as confessionsApi from '@/src/lib/confessionsApi';
import { markConfessionsSeen } from '@/src/lib/confessionPulse';
import type { Confession } from '@/src/lib/confessionsApi';
import * as eventsApi from '@/src/lib/eventsApi';
import type { Campus } from '@/src/lib/eventsApi';
import {
  ConfessionHeader,
  campusShortName,
  getConfessionTagColor,
  tagLabel,
} from '@/src/components/confessions/ConfessionHeader';

const PAGE_SIZE = 20;
const MAX_CONTENT = 500;

export const CONFESSION_TAGS = ['🔥 All', '☕️ Tea', '❤️ Crush', '📚 Rant', '❓ Advice'];
export const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '🔥'];

const PROMPT_KEYS = ['confessionPrompt1', 'confessionPrompt2', 'confessionPrompt3', 'confessionPrompt4'] as const;

const sameCampus = (a: string, b: string) =>
  a === b || campusShortName(a).trim().toLowerCase() === campusShortName(b).trim().toLowerCase();

function getTopReactions(counts: Record<string, number> | undefined) {
  if (!counts) return [];
  const entries = Object.entries(counts).filter(([_, c]) => c > 0);
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, 3).map(e => e[0]);
}

// Horizontal filter: the active item is a solid pill, the rest plain text.
function FilterRow({ items, activeItem, onSelect, theme, renderLabel, iconFor, leading }: any) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
      {leading}
      {items.map((item: any) => {
        const isActive = activeItem === item;
        const icon = iconFor?.(item);
        const color = isActive ? theme.textInverse : theme.textSecondary;
        return (
          <Pressable
            key={item === null ? 'null-key' : item}
            onPress={() => {
              if (!isActive) Haptics.selectionAsync().catch(() => {});
              onSelect(item);
            }}
            style={[s.filterItem, isActive && { backgroundColor: theme.primary }]}
          >
            {icon ? <Feather name={icon} size={12} color={color} /> : null}
            <Text style={[s.filterText, { color, fontWeight: isActive ? '700' : '500' }]}>
              {renderLabel ? renderLabel(item) : item}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function ConfessionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, language } = useApp();
  const T = useTranslations(language);
  // Map bubbles deep-link straight into one campus's feed.
  const { campus: campusParam } = useLocalSearchParams<{ campus?: string }>();

  const userUni = (user as any)?.universityId ?? null;
  const universityName = (user as any)?.university?.trim() || userUni || '';
  const userCampus: string | null = ((user as any)?.campus ?? '').trim() || null;
  const myName: string = ((user as any)?.name ?? '').trim();
  const myAvatar: string | null = (user as any)?.avatar || null;

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>('🔥 All');
  const [sort, setSort] = useState<'new' | 'hot'>('new');
  const [shareTarget, setShareTarget] = useState<Confession | null>(null);
  const shareCardRef = useRef<any>(null);
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
  const [draftAnon, setDraftAnon] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  /** Why the server refused this draft — a blocked word, a number, a link. */
  const [postError, setPostError] = useState<string | null>(null);
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
      if (campusParam && list.some((c) => c.name === campusParam)) {
        setSelectedCampus(campusParam);
      } else if (list.length > 1 && userCampus) {
        const match = list.find((c) => sameCampus(c.name, userCampus));
        if (match) setSelectedCampus(match.name);
      }
    }).catch(() => {});
  }, [userUni, userCampus, campusParam]);

  const loadFeed = useCallback(async () => {
    if (!userUni) { setItems([]); setLoading(false); setRefreshing(false); return; }
    try {
      const tagQuery = selectedTag === '🔥 All' ? null : selectedTag;
      const data = await confessionsApi.fetchConfessions({ limit: sort === 'hot' ? 50 : PAGE_SIZE, campus: selectedCampus, tag: tagQuery, search: activeSearch || null, sort });
      setItems(data.filter((c) => !hiddenIdsRef.current.has(c.id)));
      setHasMore(sort === 'new' && data.length >= PAGE_SIZE);
    } catch (e) { if (__DEV__) console.warn('[Confessions] load error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [userUni, selectedCampus, selectedTag, activeSearch, sort]);

  const loadMore = useCallback(async () => {
    if (!userUni || sort === 'hot' || loadingMore || !hasMore || items.length === 0) return;
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
  }, [userUni, sort, loadingMore, hasMore, items, selectedCampus, selectedTag, activeSearch]);

  useFocusEffect(useCallback(() => { setLoading(true); void loadFeed(); }, [loadFeed]));
  // Opening the feed clears the "N new" badge on the Community tab.
  useFocusEffect(useCallback(() => () => { void markConfessionsSeen(); }, []));

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
    setPostError(null);
    try {
      const created = await confessionsApi.createConfession(text, draftTag, draftAnon);
      const campusMatch = selectedCampus === null || created.campus === selectedCampus || created.campus === null;
      const tagMatch = selectedTag === '🔥 All' || created.tag === selectedTag;
      if (campusMatch && tagMatch) setItems((p) => [created, ...p]);
      setDraft(''); setDraftTag(null); setDraftAnon(true); setComposerOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      // Shown in the composer, not in an alert: the filter's messages all say
      // what to take out, and the draft is right there to edit.
      setPostError(e?.message || T('confessionPostError'));
    }
    finally { setSubmitting(false); }
  };

  const showCampusFilter = campuses.length > 1;
  // The student's own campus leads the row (📍) so they always know where
  // they're reading/posting; "All" and the other campuses follow.
  const ownCampus = userCampus ? campuses.find((c) => sameCampus(c.name, userCampus))?.name ?? null : null;
  const campusItems = ownCampus
    ? [ownCampus, null, ...campuses.map((c) => c.name).filter((n) => n !== ownCampus)]
    : [null, ...campuses.map((c) => c.name)];
  const postingCampusLabel = ownCampus ? campusShortName(ownCampus) : userCampus ? campusShortName(userCampus) : '';
  const universityShort = userUni ? String(userUni).toUpperCase() : undefined;

  const handleShare = async (item: Confession) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShareTarget(item);
    // Let the off-screen card render this confession before capturing it.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    const res = await shareExportCanvas(shareCardRef.current);
    if (res === 'error') Alert.alert(T('error'), T('confessionShareError'));
  };

  const openComposer = (starter?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (starter && !draft.trim()) setDraft(starter);
    setPostError(null);
    setComposerOpen(true);
  };

  /* ── Feed row: no box, text is the hero ── */
  const renderCard = ({ item }: { item: Confession }) => {
    const isPickerOpen = activeReactionPicker === item.id;
    const reacted = !!item.my_reaction;
    const topReactions = getTopReactions(item.reaction_counts);
    const openDetail = () => router.push({ pathname: '/community/confession-detail', params: { confessionId: item.id } } as any);

    return (
      <View>
        {isPickerOpen && (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={s.reactionBubbleContainer}>
            <View style={[s.reactionBubble, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPressIn={() => void handleReaction(item, emoji)}
                  style={({ pressed }) => [s.reactionBubbleBtn, pressed && { transform: [{ scale: 1.3 }] }]}
                >
                  <Text style={s.reactionBubbleEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        <Pressable
          style={({ pressed }) => [s.row, pressed && { backgroundColor: theme.backgroundSecondary }]}
          onPress={openDetail}
        >
          <ConfessionHeader
            confession={item}
            theme={theme}
            anonLabel={T('confessionAnon')}
            universityShort={universityShort}
          />

          <Text style={[s.contentText, { color: theme.text }]}>{item.content}</Text>

          <View style={s.actions}>
            <Pressable
              hitSlop={10}
              style={s.action}
              onPress={(e) => { e.stopPropagation?.(); void handleReaction(item, reacted ? null : '❤️'); }}
              onLongPress={(e) => {
                e.stopPropagation?.();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
                setActiveReactionPicker(isPickerOpen ? null : item.id);
              }}
              delayLongPress={200}
            >
              {reacted ? (
                <Text style={s.actionEmoji}>{item.my_reaction}</Text>
              ) : (
                <Feather name="heart" size={18} color={theme.textSecondary} />
              )}
              {/* Zero reads as "nobody cares" — only show a count once there is one. */}
              {item.like_count > 0 && (
                <Text style={[s.actionCount, { color: reacted ? theme.text : theme.textSecondary }]}>{item.like_count}</Text>
              )}
            </Pressable>

            <Pressable hitSlop={10} style={s.action} onPress={(e) => { e.stopPropagation?.(); openDetail(); }}>
              <Feather name="message-circle" size={18} color={theme.textSecondary} />
              {item.comment_count > 0 && <Text style={[s.actionCount, { color: theme.textSecondary }]}>{item.comment_count}</Text>}
            </Pressable>

            <Pressable hitSlop={10} style={s.action} onPress={(e) => { e.stopPropagation?.(); void handleShare(item); }}>
              <Feather name="send" size={17} color={theme.textSecondary} />
            </Pressable>

            {!reacted && topReactions.length > 1 && (
              <Text style={s.topReactions}>{topReactions.join('')}</Text>
            )}
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
            <Pressable onPress={() => openComposer()} hitSlop={12}>
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
          <FilterRow
            items={campusItems}
            activeItem={selectedCampus}
            onSelect={(c: any) => { setSelectedCampus(c); setItems([]); setHasMore(true); setLoading(true); }}
            theme={theme}
            renderLabel={(c: any) => c === null ? T('confessionAllCampuses') : campusShortName(c)}
            iconFor={(c: any) => (c !== null && c === ownCampus ? 'map-pin' : null)}
          />
        )}
        <FilterRow
          items={CONFESSION_TAGS}
          renderLabel={(t: string) => tagLabel(t)}
          leading={
            <>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSort((v) => (v === 'hot' ? 'new' : 'hot'));
                  setItems([]); setHasMore(true); setLoading(true);
                }}
                style={[s.filterItem, sort === 'hot' && { backgroundColor: '#EA580C' }]}
              >
                <Feather name="trending-up" size={13} color={sort === 'hot' ? '#fff' : theme.textSecondary} />
                <Text style={[s.filterText, { color: sort === 'hot' ? '#fff' : theme.textSecondary, fontWeight: sort === 'hot' ? '700' : '500' }]}>
                  {T('confessionHot')}
                </Text>
              </Pressable>
              <View style={[s.filterDivider, { backgroundColor: theme.border }]} />
            </>
          }
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
        // No composer row above the feed: the header's compose button already
        // opens it, and the row repeated that in more space than it was worth.
        ItemSeparatorComponent={() => <View style={[s.separator, { backgroundColor: theme.border }]} />}
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

      <ConfessionShareCard ref={shareCardRef} confession={shareTarget} universityShort={universityShort} />

      {/* ─── Compose Modal ───── */}
      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setComposerOpen(false)} />
          </View>
          <View style={[s.modalSheet, { backgroundColor: theme.card }]}>
            <View style={s.sheetBar}>
              <Pressable onPress={() => setComposerOpen(false)} hitSlop={10}>
                <Text style={[s.sheetBarBtn, { color: theme.textSecondary }]}>{T('cancel')}</Text>
              </Pressable>
              <Text style={[s.sheetTitle, { color: theme.text }]}>Spill the tea</Text>
              <Pressable onPress={() => void handleSubmit()} disabled={!draft.trim() || submitting} hitSlop={10}>
                {submitting ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <Text style={[s.sheetBarBtn, { color: theme.primary, fontWeight: '700', opacity: draft.trim() ? 1 : 0.35 }]}>{T('confessionPost')}</Text>
                )}
              </Pressable>
            </View>

            {/* Who you're posting as — tap to switch */}
            <Pressable
              style={s.identityRow}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setDraftAnon((v) => !v); }}
            >
              <View style={[s.identityAvatar, { backgroundColor: draftAnon ? theme.text : theme.backgroundSecondary }]}>
                {draftAnon ? (
                  <Feather name="eye-off" size={15} color={theme.background} />
                ) : myAvatar ? (
                  <Image source={{ uri: myAvatar }} style={s.identityPhoto} />
                ) : (
                  <Text style={[s.identityInitial, { color: theme.text }]}>{(myName || '?').charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.identityName, { color: theme.text }]} numberOfLines={1}>
                  {draftAnon ? T('confessionModeAnon') : myName || T('confessionModeNamed')}
                  {postingCampusLabel ? <Text style={{ color: theme.textSecondary, fontWeight: '500' }}>{`  ·  ${postingCampusLabel}`}</Text> : null}
                </Text>
                <Text style={[s.identityHint, { color: theme.textSecondary }]} numberOfLines={2}>
                  {draftAnon ? T('confessionAnonSafe') : T('confessionNamedWarn')}
                </Text>
              </View>
              <View style={[s.switchPill, { borderColor: theme.border }]}>
                <Feather name="repeat" size={12} color={theme.textSecondary} />
                <Text style={[s.switchText, { color: theme.textSecondary }]}>
                  {draftAnon ? T('confessionModeNamed') : T('confessionModeAnon')}
                </Text>
              </View>
            </Pressable>

            <TextInput
              style={[s.composerInput, { color: theme.text }]}
              placeholder="What's on your mind?"
              placeholderTextColor={theme.textSecondary + '99'}
              multiline maxLength={MAX_CONTENT} value={draft}
              onChangeText={(v) => { setDraft(v); if (postError) setPostError(null); }}
              autoFocus
            />

            {!!postError && (
              <View style={s.postError}>
                <Feather name="alert-circle" size={14} color={theme.danger} />
                <Text style={[s.postErrorText, { color: theme.danger }]}>{postError}</Text>
              </View>
            )}

            {!draft.trim() && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={s.chipScroll}>
                {PROMPT_KEYS.map((k) => (
                  <Pressable
                    key={k}
                    style={[s.promptChip, { borderColor: theme.border }]}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setDraft(T(k)); }}
                  >
                    <Text style={[s.promptChipText, { color: theme.text }]}>{T(k).trim().replace(/:$/, "")}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={[s.composerFooter, { borderTopColor: theme.border }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={s.chipScroll}>
                {CONFESSION_TAGS.filter(t => t !== '🔥 All').map((tag) => {
                  const isSelected = draftTag === tag;
                  const tagColor = getConfessionTagColor(tag);
                  return (
                    <Pressable
                      key={tag}
                      style={[s.tagOption, isSelected && { backgroundColor: tagColor }]}
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setDraftTag(isSelected ? null : tag); }}
                    >
                      <Text style={[s.tagOptionText, { color: isSelected ? '#fff' : tagColor }]}>{tagLabel(tag)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {draft.length > MAX_CONTENT * 0.8 && (
                <Text style={[s.charCount, { color: draft.length > MAX_CONTENT * 0.95 ? theme.danger : theme.textSecondary }]}>{MAX_CONTENT - draft.length}</Text>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12 },
  headerLeft: { width: 60, alignItems: 'center', justifyContent: 'center' },
  headerRight: { width: 60, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4 },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 2, opacity: 0.8 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },

  /* Filters */
  filtersWrapper: { paddingTop: 4, paddingBottom: 10, gap: 6 },
  filterScroll: { paddingHorizontal: 12, gap: 2 },
  filterItem: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  filterText: { fontSize: 14, letterSpacing: -0.1 },
  filterDivider: { width: StyleSheet.hairlineWidth, height: 18, alignSelf: 'center', marginHorizontal: 6 },

  listContent: { paddingBottom: 120 },

  postError: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8,
  },
  postErrorText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 19 },

  /* Feed row */
  row: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 20 },
  contentText: { fontSize: 17, lineHeight: 24, marginTop: 8, letterSpacing: -0.2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  actionEmoji: { fontSize: 17 },
  actionCount: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  topReactions: { fontSize: 13, letterSpacing: -2, marginLeft: 'auto' },

  /* Reaction bubble */
  reactionBubbleContainer: { position: 'absolute', bottom: 40, left: 12, zIndex: 100 },
  reactionBubble: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8, paddingVertical: 6, gap: 2,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  reactionBubbleBtn: { padding: 6, borderRadius: 999 },
  reactionBubbleEmoji: { fontSize: 24 },

  /* Empty */
  emptyWrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 64, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },

  /* Composer */
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  sheetBarBtn: { fontSize: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  identityPhoto: { width: 36, height: 36, borderRadius: 18 },
  identityInitial: { fontSize: 15, fontWeight: '700' },
  identityName: { fontSize: 15, fontWeight: '700' },
  identityHint: { fontSize: 12, marginTop: 1 },
  switchPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  switchText: { fontSize: 12, fontWeight: '600' },
  composerInput: { minHeight: 120, maxHeight: 260, fontSize: 18, lineHeight: 25, textAlignVertical: 'top', paddingTop: 14, paddingBottom: 8, paddingHorizontal: 0 },
  chipScroll: { gap: 8, paddingVertical: 2 },
  promptChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  promptChipText: { fontSize: 13, fontWeight: '500' },
  composerFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  tagOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tagOptionText: { fontSize: 14, fontWeight: '600' },
  charCount: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
