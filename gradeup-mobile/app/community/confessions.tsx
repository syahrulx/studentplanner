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

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import * as confessionsApi from '@/src/lib/confessionsApi';
import type { Confession } from '@/src/lib/confessionsApi';
import * as eventsApi from '@/src/lib/eventsApi';
import type { Campus } from '@/src/lib/eventsApi';

const PAGE_SIZE = 20;
const MAX_CONTENT = 500;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export default function ConfessionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, language } = useApp();
  const T = useTranslations(language);

  const userUni = (user as any)?.universityId ?? null;
  const universityName = (user as any)?.university?.trim() || userUni || '';
  // campus is a plain text name, e.g. "UiTM Kampus Shah Alam"
  const userCampus: string | null = ((user as any)?.campus ?? '').trim() || null;

  const [campuses, setCampuses] = useState<Campus[]>([]);
  // null = "All Campuses", string = specific campus name
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);

  const [items, setItems] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const hiddenIdsRef = useRef<Set<string>>(new Set());

  // Load campus list once we know the university
  useEffect(() => {
    if (!userUni) return;
    eventsApi.fetchCampuses(userUni).then((list) => {
      setCampuses(list);
      // Auto-select user's campus if they have one and campuses exist
      if (list.length > 1 && userCampus) {
        const match = list.find((c) => c.name === userCampus);
        if (match) setSelectedCampus(match.name);
      }
    }).catch(() => {});
  }, [userUni, userCampus]);

  const loadFeed = useCallback(async () => {
    if (!userUni) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const data = await confessionsApi.fetchConfessions({
        limit: PAGE_SIZE,
        campus: selectedCampus,
      });
      const filtered = data.filter((c) => !hiddenIdsRef.current.has(c.id));
      setItems(filtered);
      setHasMore(data.length >= PAGE_SIZE);
    } catch (e) {
      if (__DEV__) console.warn('[Confessions] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userUni, selectedCampus]);

  const loadMore = useCallback(async () => {
    if (!userUni || loadingMore || !hasMore || items.length === 0) return;
    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      const data = await confessionsApi.fetchConfessions({
        before: last.created_at,
        limit: PAGE_SIZE,
        campus: selectedCampus,
      });
      const filtered = data.filter((c) => !hiddenIdsRef.current.has(c.id));
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = [...prev];
        for (const row of filtered) {
          if (!seen.has(row.id)) next.push(row);
        }
        return next;
      });
      setHasMore(data.length >= PAGE_SIZE);
    } catch (e) {
      if (__DEV__) console.warn('[Confessions] loadMore error:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [userUni, loadingMore, hasMore, items, selectedCampus]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadFeed();
    }, [loadFeed]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    void loadFeed();
  };

  const handleSelectCampus = (campus: string | null) => {
    if (campus === selectedCampus) return;
    setSelectedCampus(campus);
    setItems([]);
    setHasMore(true);
    setLoading(true);
  };

  const handleToggleLike = async (item: Confession) => {
    const wasLiked = item.liked_by_me;
    const delta = wasLiked ? -1 : 1;
    setItems((prev) =>
      prev.map((c) =>
        c.id === item.id
          ? { ...c, liked_by_me: !wasLiked, like_count: Math.max(0, c.like_count + delta) }
          : c,
      ),
    );
    try {
      await confessionsApi.toggleConfessionLike(item.id);
    } catch {
      setItems((prev) =>
        prev.map((c) =>
          c.id === item.id
            ? { ...c, liked_by_me: wasLiked, like_count: Math.max(0, c.like_count - delta) }
            : c,
        ),
      );
    }
  };

  const handleReport = (item: Confession) => {
    Alert.alert(T('confessionReportTitle'), T('confessionReportPrompt'), [
      {
        text: T('confessionReportInappropriate'),
        onPress: () => {
          void confessionsApi.reportConfession(item.id, 'inappropriate').then(() => {
            hiddenIdsRef.current.add(item.id);
            setItems((prev) => prev.filter((c) => c.id !== item.id));
            Alert.alert(T('confessionReportedTitle'), T('confessionReportedBody'));
          }).catch(() => {});
        },
      },
      {
        text: T('confessionReportSpam'),
        onPress: () => {
          void confessionsApi.reportConfession(item.id, 'spam').then(() => {
            hiddenIdsRef.current.add(item.id);
            setItems((prev) => prev.filter((c) => c.id !== item.id));
            Alert.alert(T('confessionReportedTitle'), T('confessionReportedBody'));
          }).catch(() => {});
        },
      },
      {
        text: T('confessionReportHarassment'),
        onPress: () => {
          void confessionsApi.reportConfession(item.id, 'harassment').then(() => {
            hiddenIdsRef.current.add(item.id);
            setItems((prev) => prev.filter((c) => c.id !== item.id));
            Alert.alert(T('confessionReportedTitle'), T('confessionReportedBody'));
          }).catch(() => {});
        },
      },
      { text: T('cancel'), style: 'cancel' },
    ]);
  };

  const handleDelete = (item: Confession) => {
    Alert.alert(T('confessionDeleteTitle'), T('confessionDeleteBody'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('delete'),
        style: 'destructive',
        onPress: () => {
          void confessionsApi.deleteConfession(item.id).then(() => {
            setItems((prev) => prev.filter((c) => c.id !== item.id));
          }).catch((e: Error) => Alert.alert(T('error'), e.message));
        },
      },
    ]);
  };

  const handleMenu = (item: Confession) => {
    const buttons: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [
      { text: T('confessionReport'), onPress: () => handleReport(item) },
    ];
    if (item.is_mine) {
      buttons.unshift({ text: T('delete'), style: 'destructive', onPress: () => handleDelete(item) });
    }
    buttons.push({ text: T('cancel'), style: 'cancel' });
    Alert.alert(T('confessionOptions'), undefined, buttons);
  };

  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const created = await confessionsApi.createConfession(text);
      // Only prepend if it matches the current campus filter
      if (selectedCampus === null || created.campus === selectedCampus || created.campus === null) {
        setItems((prev) => [created, ...prev]);
      }
      setDraft('');
      setComposerOpen(false);
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || T('confessionPostError'));
    } finally {
      setSubmitting(false);
    }
  };

  // Short display label for a campus name
  const campusShort = (name: string) => {
    // Strip a common "UiTM Kampus " prefix to keep pills compact
    return name.replace(/^.+?kampus\s+/i, '').replace(/^.+?campus\s+/i, '') || name;
  };

  const showCampusFilter = campuses.length > 1;

  const renderCard = ({ item }: { item: Confession }) => (
    <Pressable
      style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() =>
        router.push({
          pathname: '/community/confession-detail',
          params: { confessionId: item.id },
        } as any)
      }
    >
      <View style={s.cardHeader}>
        <View style={[s.anonBadge, { backgroundColor: theme.primary + '18' }]}>
          <Feather name="eye-off" size={13} color={theme.primary} />
          <Text style={[s.anonText, { color: theme.primary }]}>{T('confessionAnonymous')}</Text>
        </View>
        {/* Campus pill on individual cards when viewing "All" */}
        {!selectedCampus && item.campus ? (
          <View style={[s.campusPill, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="map-pin" size={10} color={theme.textSecondary} />
            <Text style={[s.campusPillText, { color: theme.textSecondary }]} numberOfLines={1}>
              {campusShort(item.campus)}
            </Text>
          </View>
        ) : null}
        <Text style={[s.timeText, { color: theme.textSecondary }]}>{timeAgo(item.created_at)}</Text>
        <Pressable
          hitSlop={12}
          onPress={(e) => { e.stopPropagation?.(); handleMenu(item); }}
          style={s.menuBtn}
        >
          <Feather name="more-horizontal" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      <Text style={[s.content, { color: theme.text }]}>{item.content}</Text>

      <View style={s.actions}>
        <Pressable
          style={s.actionBtn}
          onPress={(e) => { e.stopPropagation?.(); void handleToggleLike(item); }}
        >
          <Feather name="heart" size={18} color={item.liked_by_me ? '#ef4444' : theme.textSecondary} />
          <Text style={[s.actionText, { color: theme.textSecondary }]}>
            {item.like_count > 0 ? String(item.like_count) : ''}
          </Text>
        </Pressable>
        <Pressable style={s.actionBtn}>
          <Feather name="message-circle" size={18} color={theme.textSecondary} />
          <Text style={[s.actionText, { color: theme.textSecondary }]}>
            {item.comment_count > 0 ? String(item.comment_count) : ''}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );

  return (
    <View style={[s.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* ─── Header ────────────────────────────────────────────── */}
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={s.headerBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: theme.text }]}>{T('confessionsTitle')}</Text>
          {universityName ? (
            <Text style={[s.headerSub, { color: theme.textSecondary }]} numberOfLines={1}>
              {universityName}
            </Text>
          ) : null}
        </View>
        <View style={s.headerBtn} />
      </View>

      {/* ─── "You are at X campus" banner ──────────────────────── */}
      {userCampus && showCampusFilter ? (
        <View style={[s.campusBanner, { backgroundColor: theme.primary + '12', borderBottomColor: theme.border }]}>
          <Feather name="map-pin" size={13} color={theme.primary} />
          <Text style={[s.campusBannerText, { color: theme.primary }]} numberOfLines={1}>
            {T('confessionYouAreAt')} <Text style={{ fontWeight: '800' }}>{userCampus}</Text>
          </Text>
        </View>
      ) : null}

      {/* ─── Campus filter pills ────────────────────────────────── */}
      {showCampusFilter ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[s.filterBar, { borderBottomColor: theme.border }]}
          contentContainerStyle={s.filterBarContent}
        >
          <Pressable
            style={[
              s.filterPill,
              { backgroundColor: selectedCampus === null ? theme.primary : theme.card, borderColor: selectedCampus === null ? theme.primary : theme.border },
            ]}
            onPress={() => handleSelectCampus(null)}
          >
            <Text style={[s.filterPillText, { color: selectedCampus === null ? '#fff' : theme.text }]}>
              {T('confessionAllCampuses')}
            </Text>
          </Pressable>
          {campuses.map((campus) => {
            const active = selectedCampus === campus.name;
            const isYours = campus.name === userCampus;
            return (
              <Pressable
                key={campus.id}
                style={[
                  s.filterPill,
                  { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
                ]}
                onPress={() => handleSelectCampus(campus.name)}
              >
                {isYours ? <Feather name="map-pin" size={11} color={active ? '#fff' : theme.primary} style={{ marginRight: 3 }} /> : null}
                <Text
                  style={[s.filterPillText, { color: active ? '#fff' : theme.text, fontWeight: isYours ? '800' : '600' }]}
                  numberOfLines={1}
                >
                  {campusShort(campus.name)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* ─── Content ───────────────────────────────────────────── */}
      {!userUni ? (
        <View style={s.emptyWrap}>
          <Feather name="book" size={40} color={theme.textSecondary} />
          <Text style={[s.emptyTitle, { color: theme.text }]}>{T('confessionNoUniversityTitle')}</Text>
          <Text style={[s.emptyBody, { color: theme.textSecondary }]}>{T('confessionNoUniversityBody')}</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Feather name="edit-3" size={40} color={theme.textSecondary} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>{T('confessionEmptyTitle')}</Text>
              <Text style={[s.emptyBody, { color: theme.textSecondary }]}>
                {selectedCampus
                  ? T('confessionEmptyBody')
                  : T('confessionEmptyBody')}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.primary} /> : null
          }
        />
      )}

      {/* ─── FAB ───────────────────────────────────────────────── */}
      {userUni ? (
        <Pressable
          style={[s.fab, { backgroundColor: theme.primary, bottom: insets.bottom + 20 }]}
          onPress={() => setComposerOpen(true)}
        >
          <Feather name="plus" size={24} color="#fff" />
        </Pressable>
      ) : null}

      {/* ─── Compose modal ─────────────────────────────────────── */}
      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={s.modalBackdrop} onPress={() => setComposerOpen(false)} />
          <View style={[s.modalSheet, { backgroundColor: theme.card }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>{T('confessionComposeTitle')}</Text>
            {/* Show the campus this confession will be tagged to */}
            {userCampus ? (
              <View style={[s.composerCampusRow, { backgroundColor: theme.primary + '12' }]}>
                <Feather name="map-pin" size={12} color={theme.primary} />
                <Text style={[s.composerCampusText, { color: theme.primary }]}>
                  {T('confessionPostingAs')} <Text style={{ fontWeight: '800' }}>{userCampus}</Text>
                </Text>
              </View>
            ) : null}
            <Text style={[s.modalHint, { color: theme.textSecondary }]}>{T('confessionRules')}</Text>
            <TextInput
              style={[s.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              placeholder={T('confessionComposePlaceholder')}
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={MAX_CONTENT}
              value={draft}
              onChangeText={setDraft}
              autoFocus
            />
            <Text style={[s.charCount, { color: theme.textSecondary }]}>
              {draft.length}/{MAX_CONTENT}
            </Text>
            <View style={s.modalActions}>
              <Pressable onPress={() => setComposerOpen(false)} style={s.modalCancel}>
                <Text style={{ color: theme.textSecondary }}>{T('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[s.modalSubmit, { backgroundColor: draft.trim() ? theme.primary : theme.border }]}
                onPress={() => void handleSubmit()}
                disabled={!draft.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.modalSubmitText}>{T('confessionPost')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12, fontWeight: '600', marginTop: 2, maxWidth: 220 },

  campusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  campusBannerText: { fontSize: 12, lineHeight: 16, flex: 1 },

  filterBar: { maxHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    maxWidth: 180,
  },
  filterPillText: { fontSize: 13, fontWeight: '600' },

  listContent: { padding: 16, paddingBottom: 100, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  anonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  anonText: { fontSize: 12, fontWeight: '700' },
  campusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: 120,
  },
  campusPillText: { fontSize: 10, fontWeight: '600' },
  timeText: { fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  menuBtn: { padding: 4 },
  content: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 20, marginTop: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 13, fontWeight: '700', minWidth: 12 },

  emptyWrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 64, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },

  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  composerCampusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 10,
  },
  composerCampusText: { fontSize: 12, flex: 1 },
  modalHint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  modalInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: 12, textAlign: 'right', marginTop: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  modalCancel: { paddingVertical: 12, paddingHorizontal: 16 },
  modalSubmit: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, minWidth: 88, alignItems: 'center' },
  modalSubmitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
