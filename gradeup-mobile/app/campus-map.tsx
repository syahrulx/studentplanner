import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  SectionList,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import * as roomsApi from '@/src/lib/campusRoomsApi';
import type { CampusRoom } from '@/src/lib/campusRoomsApi';
import * as eventsApi from '@/src/lib/eventsApi';
import type { Campus } from '@/src/lib/eventsApi';

type Section = { title: string; data: CampusRoom[] };

function campusShort(name: string): string {
  return name.replace(/^.+?kampus\s+/i, '').replace(/^.+?campus\s+/i, '') || name;
}

/** Ignore email-like / empty faculty values (some profiles store an email). */
function sanitizeFaculty(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v || v.includes('@')) return null;
  return v;
}

export default function CampusMapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, language } = useApp();
  const T = useTranslations(language);
  const params = useLocalSearchParams<{ q?: string }>();

  const userUni = (user as any)?.universityId ?? null;
  const universityName = (user as any)?.university?.trim() || userUni || '';
  const userCampus: string | null = ((user as any)?.campus ?? '').trim() || null;
  const userFaculty: string | null = sanitizeFaculty((user as any)?.faculty);

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);
  const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
  const [search, setSearch] = useState(typeof params.q === 'string' ? params.q : '');
  const [items, setItems] = useState<CampusRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hiddenIdsRef = useRef<Set<string>>(new Set());

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

  const loadRooms = useCallback(async () => {
    if (!userUni) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const data = await roomsApi.fetchCampusRooms({ campus: selectedCampus });
      setItems(data.filter((r) => !hiddenIdsRef.current.has(r.id)));
    } catch (e) {
      if (__DEV__) console.warn('[CampusMap] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userUni, selectedCampus]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadRooms();
    }, [loadRooms]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    void loadRooms();
  };

  const handleSelectCampus = (campus: string | null) => {
    if (campus === selectedCampus) return;
    setSelectedCampus(campus);
    setItems([]);
    setLoading(true);
  };

  // Distinct faculties present in the loaded set, so users can narrow the
  // directory to a single faculty (the same room code can exist in several).
  const facultyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of items) {
      const f = r.faculty?.trim();
      if (f) set.add(f);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Drop a stale faculty selection when the loaded set no longer has it.
  useEffect(() => {
    if (selectedFaculty && !facultyOptions.includes(selectedFaculty)) {
      setSelectedFaculty(null);
    }
  }, [facultyOptions, selectedFaculty]);

  // Client-side search over the loaded set (server also supports search, but
  // local filtering is instant as the user types).
  const sections: Section[] = useMemo(() => {
    const rawQ = search.trim().toLowerCase();
    const q = roomsApi.stripRoomPrefixes(rawQ).toLowerCase();
    const base = selectedFaculty ? items.filter((r) => r.faculty === selectedFaculty) : items;
    const filtered = q
      ? base.filter((r) =>
          [r.room_code, r.room_label, r.building, r.level, r.description, r.faculty]
            .filter(Boolean)
            .some((v) => {
              const str = String(v).toLowerCase();
              // Check against both the raw query (e.g., if they typed an exact label) and the stripped query
              return str.includes(rawQ) || str.includes(q);
            }),
        )
      : base;
    const byBuilding = new Map<string, CampusRoom[]>();
    for (const r of filtered) {
      const key = r.building?.trim() || T('campusMapNoBuilding');
      if (!byBuilding.has(key)) byBuilding.set(key, []);
      byBuilding.get(key)!.push(r);
    }
    return Array.from(byBuilding.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([title, data]) => ({ title, data }));
  }, [items, search, selectedFaculty, T]);

  const handleVote = async (room: CampusRoom, dir: 1 | -1) => {
    const next = room.my_vote === dir ? 0 : dir;
    // optimistic
    setItems((prev) =>
      prev.map((r) => {
        if (r.id !== room.id) return r;
        let up = r.upvote_count;
        let down = r.downvote_count;
        if (r.my_vote === 1) up -= 1;
        if (r.my_vote === -1) down -= 1;
        if (next === 1) up += 1;
        if (next === -1) down += 1;
        return { ...r, my_vote: next, upvote_count: Math.max(0, up), downvote_count: Math.max(0, down) };
      }),
    );
    try {
      const res = await roomsApi.voteCampusRoom(room.id, next as 1 | -1 | 0);
      setItems((prev) =>
        prev.map((r) =>
          r.id === room.id
            ? { ...r, my_vote: res.my_vote, upvote_count: res.upvote_count, downvote_count: res.downvote_count, verified: res.verified }
            : r,
        ),
      );
    } catch {
      void loadRooms();
    }
  };

  const handleReport = (room: CampusRoom) => {
    Alert.alert(T('campusMapReportTitle'), T('campusMapReportPrompt'), [
      {
        text: T('campusMapReportIncorrect'),
        onPress: () => doReport(room, 'incorrect'),
      },
      {
        text: T('campusMapReportDuplicate'),
        onPress: () => doReport(room, 'duplicate'),
      },
      { text: T('cancel'), style: 'cancel' },
    ]);
  };

  const doReport = (room: CampusRoom, reason: roomsApi.RoomReportReason) => {
    void roomsApi.reportCampusRoom(room.id, reason).then(() => {
      hiddenIdsRef.current.add(room.id);
      setItems((prev) => prev.filter((r) => r.id !== room.id));
      Alert.alert(T('campusMapReportedTitle'), T('campusMapReportedBody'));
    }).catch(() => {});
  };

  const handleDelete = (room: CampusRoom) => {
    Alert.alert(T('campusMapDeleteTitle'), T('campusMapDeleteBody'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('delete'),
        style: 'destructive',
        onPress: () => {
          void roomsApi.deleteCampusRoom(room.id).then(() => {
            setItems((prev) => prev.filter((r) => r.id !== room.id));
          }).catch((e: Error) => Alert.alert(T('error'), e.message));
        },
      },
    ]);
  };

  const handleMenu = (room: CampusRoom) => {
    const buttons: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [
      { text: T('campusMapReport'), onPress: () => handleReport(room) },
    ];
    if (room.is_mine) {
      buttons.unshift({ text: T('delete'), style: 'destructive', onPress: () => handleDelete(room) });
    }
    buttons.push({ text: T('cancel'), style: 'cancel' });
    Alert.alert(T('campusMapOptions'), undefined, buttons);
  };

  const showCampusFilter = campuses.length > 1;

  const renderRoom = ({ item }: { item: CampusRoom }) => {
    const locBits = [item.level, item.description].filter(Boolean);
    return (
      <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={s.cardTop}>
          <View style={[s.codeBadge, { backgroundColor: theme.primary + '18' }]}>
            <Text style={[s.codeText, { color: theme.primary }]}>{item.room_code}</Text>
          </View>
          {item.verified ? (
            <View style={[s.verifiedBadge, { backgroundColor: '#16a34a18' }]}>
              <Feather name="check-circle" size={12} color="#16a34a" />
              <Text style={[s.verifiedText, { color: '#16a34a' }]}>{T('campusMapVerified')}</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable hitSlop={12} onPress={() => handleMenu(item)} style={s.menuBtn}>
            <Feather name="more-horizontal" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>

        {item.room_label ? (
          <Text style={[s.label, { color: theme.text }]}>{item.room_label}</Text>
        ) : null}
        {locBits.length > 0 ? (
          <Text style={[s.loc, { color: theme.textSecondary }]}>{locBits.join(' · ')}</Text>
        ) : null}
        {item.faculty ? (
          <View style={s.facultyTag}>
            <Feather name="bookmark" size={11} color={theme.textSecondary} />
            <Text style={[s.facultyTagText, { color: theme.textSecondary }]} numberOfLines={1}>{item.faculty}</Text>
          </View>
        ) : null}

        <View style={s.voteRow}>
          <Text style={[s.voteQ, { color: theme.textSecondary }]}>{T('campusMapAccuratePrompt')}</Text>
          <Pressable
            style={[s.voteBtn, item.my_vote === 1 && { backgroundColor: '#16a34a18' }]}
            onPress={() => void handleVote(item, 1)}
            hitSlop={8}
          >
            <Feather name="thumbs-up" size={15} color={item.my_vote === 1 ? '#16a34a' : theme.textSecondary} />
            <Text style={[s.voteCount, { color: item.my_vote === 1 ? '#16a34a' : theme.textSecondary }]}>
              {item.upvote_count > 0 ? item.upvote_count : ''}
            </Text>
          </Pressable>
          <Pressable
            style={[s.voteBtn, item.my_vote === -1 && { backgroundColor: '#ef444418' }]}
            onPress={() => void handleVote(item, -1)}
            hitSlop={8}
          >
            <Feather name="thumbs-down" size={15} color={item.my_vote === -1 ? '#ef4444' : theme.textSecondary} />
            <Text style={[s.voteCount, { color: item.my_vote === -1 ? '#ef4444' : theme.textSecondary }]}>
              {item.downvote_count > 0 ? item.downvote_count : ''}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={s.headerBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: theme.text }]}>{T('campusMapTitle')}</Text>
          {universityName ? (
            <Text style={[s.headerSub, { color: theme.textSecondary }]} numberOfLines={1}>
              {universityName}
            </Text>
          ) : null}
        </View>
        <View style={s.headerBtn} />
      </View>

      {userCampus && showCampusFilter ? (
        <View style={[s.campusBanner, { backgroundColor: theme.primary + '12', borderBottomColor: theme.border }]}>
          <Feather name="map-pin" size={13} color={theme.primary} />
          <Text style={[s.campusBannerText, { color: theme.primary }]} numberOfLines={1}>
            {T('confessionYouAreAt')} <Text style={{ fontWeight: '800' }}>{userCampus}</Text>
          </Text>
        </View>
      ) : null}

      {showCampusFilter ? (
        <View style={[s.filterBar, { borderBottomColor: theme.border }]}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ id: '__all__', name: null as string | null }, ...campuses.map((c) => ({ id: c.id, name: c.name }))]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.filterBarContent}
            renderItem={({ item }) => {
              const isAll = item.id === '__all__';
              const active = isAll ? selectedCampus === null : selectedCampus === item.name;
              const isYours = !isAll && item.name === userCampus;
              return (
                <Pressable
                  style={[s.filterPill, { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border }]}
                  onPress={() => handleSelectCampus(item.name)}
                >
                  {isYours ? <Feather name="map-pin" size={11} color={active ? '#fff' : theme.primary} style={{ marginRight: 3 }} /> : null}
                  <Text style={[s.filterPillText, { color: active ? '#fff' : theme.text, fontWeight: isYours ? '800' : '600' }]} numberOfLines={1}>
                    {isAll ? T('confessionAllCampuses') : campusShort(item.name!)}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {facultyOptions.length > 1 ? (
        <View style={[s.filterBar, { borderBottomColor: theme.border }]}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={['__all__', ...facultyOptions]}
            keyExtractor={(item) => item}
            contentContainerStyle={s.filterBarContent}
            renderItem={({ item }) => {
              const isAll = item === '__all__';
              const active = isAll ? selectedFaculty === null : selectedFaculty === item;
              const isYours = !isAll && item === userFaculty;
              return (
                <Pressable
                  style={[s.filterPill, { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border }]}
                  onPress={() => isAll ? setSelectedFaculty(null) : setSelectedFaculty(item)}
                >
                  {isAll ? <Feather name="grid" size={11} color={active ? '#fff' : theme.textSecondary} style={{ marginRight: 3 }} /> : null}
                  {isYours ? <Feather name="bookmark" size={11} color={active ? '#fff' : theme.primary} style={{ marginRight: 3 }} /> : null}
                  <Text style={[s.filterPillText, { color: active ? '#fff' : theme.text, fontWeight: isYours ? '800' : '600' }]} numberOfLines={1}>
                    {isAll ? T('campusMapAllFaculties') : item}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {/* Search */}
      {userUni ? (
        <View style={[s.searchWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder={T('campusMapSearchPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Feather name="x" size={16} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!userUni ? (
        <View style={s.emptyWrap}>
          <Feather name="map" size={40} color={theme.textSecondary} />
          <Text style={[s.emptyTitle, { color: theme.text }]}>{T('confessionNoUniversityTitle')}</Text>
          <Text style={[s.emptyBody, { color: theme.textSecondary }]}>{T('campusMapNoUniversityBody')}</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderRoom}
          renderSectionHeader={({ section }) => (
            <View style={[s.sectionHeader, { backgroundColor: theme.background }]}>
              <Feather name="home" size={14} color={theme.primary} />
              <Text style={[s.sectionTitle, { color: theme.text }]}>{section.title}</Text>
              <Text style={[s.sectionCount, { color: theme.textSecondary }]}>{section.data.length}</Text>
            </View>
          )}
          contentContainerStyle={s.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Feather name="map-pin" size={40} color={theme.textSecondary} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>{T('campusMapEmptyTitle')}</Text>
              <Text style={[s.emptyBody, { color: theme.textSecondary }]}>{T('campusMapEmptyBody')}</Text>
            </View>
          }
        />
      )}

      {userUni ? (
        <Pressable
          style={[s.fab, { backgroundColor: theme.primary, bottom: insets.bottom + 20 }]}
          onPress={() => router.push('/campus-map-upload' as any)}
        >
          <Feather name="upload" size={22} color="#fff" />
          <Text style={s.fabText}>{T('campusMapAddBtn')}</Text>
        </Pressable>
      ) : null}
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

  filterBar: { height: 54, borderBottomWidth: StyleSheet.hairlineWidth },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'center' },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  filterPillText: { fontSize: 13, fontWeight: '600' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },

  listContent: { padding: 16, paddingBottom: 110, gap: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  sectionCount: { fontSize: 13, fontWeight: '600' },

  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  codeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  codeText: { fontSize: 14, fontWeight: '800' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  verifiedText: { fontSize: 11, fontWeight: '700' },
  menuBtn: { padding: 2 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  loc: { fontSize: 13, lineHeight: 19 },
  facultyTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  facultyTagText: { fontSize: 12, flex: 1 },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  voteQ: { fontSize: 12, flex: 1 },
  voteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  voteCount: { fontSize: 13, fontWeight: '700', minWidth: 6 },

  emptyWrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 56, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },

  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 26,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
