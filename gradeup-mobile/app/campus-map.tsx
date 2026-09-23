import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  SectionList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import * as WebBrowser from 'expo-web-browser';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import * as roomsApi from '@/src/lib/campusRoomsApi';
import type { CampusRoom } from '@/src/lib/campusRoomsApi';
import * as eventsApi from '@/src/lib/eventsApi';
import type { Campus } from '@/src/lib/eventsApi';

type Section = { title: string; data: CampusRoom[]; mapUrl?: string | null };

function campusShort(name: string): string {
  return name.replace(/^.+?kampus\s+/i, '').replace(/^.+?campus\s+/i, '') || name;
}

/** Profile campus is free text ("UiTM SHAH ALAM") — compare loosely against campuses.name. */
function sameCampus(a: string, b: string): boolean {
  const norm = (v: string) =>
    campusShort(v).toLowerCase().replace(/\(.*?\)/g, '').replace(/^(uitm|universiti teknologi mara)\s+/, '').trim();
  return a === b || norm(a) === norm(b);
}

/** Faculty values are free text with mixed casing ("acis", "FSKM") — group and show case-insensitively. */
const facultyKey = (f: string) => f.trim().toLowerCase();

/**
 * Levels arrive as "2ND FLOOR", "Aras 2", "Level 2", "2nd Floor (CS2)", "3"…
 * Parsed into what a lift button would show ("G", "LG", "2", "2·3") plus the
 * zone in brackets ("CS2"). Values that can't be a floor ("609" — a room
 * number typed into the level field) give no button; unparseable text
 * ("Mezzanine") is kept as `other` so it still shows in the meta line.
 */
type Floor = { short: string | null; zone: string | null; other: string | null };
function parseLevel(raw: string | null | undefined): Floor {
  const v = (raw ?? '').trim();
  const none: Floor = { short: null, zone: null, other: null };
  if (!v || v === '0') return none;
  const zone = v.match(/\(([^)]+)\)/)?.[1]?.trim() ?? null;
  const base = v.replace(/\(.*?\)/g, '').trim().toLowerCase();
  if (/^(lg|lower ground)\b/.test(base)) return { short: 'LG', zone, other: null };
  if (/^(g|ground)\b/.test(base)) return { short: 'G', zone, other: null };
  const floors = base.match(/\d+/g);
  if (floors && /^(aras|level|lvl|tingkat|floor)?\s*[\d\s&,-]+(st|nd|rd|th|rt)?\s*(floor)?$/.test(base)) {
    if (floors.some((n) => Number(n) > 30)) return { ...none, zone };
    return { short: floors.join('·'), zone, other: null };
  }
  return { short: null, zone, other: v };
}

/** Numbers in codes sort numerically: BK2 before BK10. */
const byCode = (a: CampusRoom, b: CampusRoom) =>
  a.room_code.localeCompare(b.room_code, undefined, { numeric: true, sensitivity: 'base' });

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
        const match = list.find((c) => sameCampus(c.name, userCampus));
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
    const byKey = new Map<string, string>();
    for (const r of items) {
      const f = r.faculty?.trim();
      if (f && !byKey.has(facultyKey(f))) byKey.set(facultyKey(f), f.toUpperCase());
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Drop a stale faculty selection when the loaded set no longer has it.
  useEffect(() => {
    if (selectedFaculty && !facultyOptions.some((f) => facultyKey(f) === facultyKey(selectedFaculty))) {
      setSelectedFaculty(null);
    }
  }, [facultyOptions, selectedFaculty]);

  // Client-side search over the loaded set (server also supports search, but
  // local filtering is instant as the user types).
  // Grouped by faculty — building is empty on most rooms (PDF directories rarely
  // name it), so grouping by building dumped nearly everything under "Other".
  const sections: Section[] = useMemo(() => {
    const rawQ = search.trim().toLowerCase();
    const q = roomsApi.stripRoomPrefixes(rawQ).toLowerCase();
    const base = selectedFaculty
      ? items.filter((r) => r.faculty && facultyKey(r.faculty) === facultyKey(selectedFaculty))
      : items;
    const filtered = q
      ? base.filter((r) =>
          [r.room_code, r.room_label, r.building, r.level, r.description, r.faculty]
            .filter(Boolean)
            .some((v) => {
              const str = String(v).toLowerCase();
              return str.includes(rawQ) || str.includes(q);
            }),
        )
      : base;
    // One flat list when narrowed (search or a single faculty) — headers only add noise.
    if (q || selectedFaculty) return filtered.length ? [{ title: '', data: [...filtered].sort(byCode) }] : [];
    const byFaculty = new Map<string, { title: string; data: CampusRoom[] }>();
    for (const r of filtered) {
      const title = r.faculty?.trim() ? r.faculty.trim().toUpperCase() : T('campusMapNoBuilding');
      const key = facultyKey(title);
      if (!byFaculty.has(key)) byFaculty.set(key, { title, data: [] });
      byFaculty.get(key)!.data.push(r);
    }
    return Array.from(byFaculty.values())
      .sort((a, b) => b.data.length - a.data.length || a.title.localeCompare(b.title))
      .map((sec) => {
        // The faculty's floor plan = the file most of its rooms were extracted from.
        const files = new Map<string, number>();
        for (const r of sec.data) if (r.source_file_url) files.set(r.source_file_url, (files.get(r.source_file_url) ?? 0) + 1);
        const mapUrl = [...files.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        return { ...sec, mapUrl, data: sec.data.sort(byCode) };
      });
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
      { text: `${room.my_vote === 1 ? '✓ ' : ''}${T('campusMapVoteUp')}`, onPress: () => void handleVote(room, 1) },
      { text: `${room.my_vote === -1 ? '✓ ' : ''}${T('campusMapVoteDown')}`, onPress: () => void handleVote(room, -1) },
      { text: T('campusMapReport'), onPress: () => handleReport(room) },
    ];
    if (room.is_mine) {
      buttons.unshift({ text: T('delete'), style: 'destructive', onPress: () => handleDelete(room) });
    }
    buttons.push({ text: T('cancel'), style: 'cancel' });
    Alert.alert(room.room_code, room.room_label ?? undefined, buttons);
  };

  const showCampusFilter = campuses.length > 1;

  const renderRoom = ({ item }: { item: CampusRoom }) => {
    const floor = parseLevel(item.level);
    const building = item.building && item.building !== '0' && facultyKey(item.building) !== facultyKey(item.faculty ?? '')
      ? item.building
      : null;
    const meta = [floor.zone, building, floor.other].filter(Boolean).join(' · ');
    const hasMap = !!item.source_file_url;
    return (
      <Pressable
        onPress={() => (hasMap ? void WebBrowser.openBrowserAsync(item.source_file_url!) : handleMenu(item))}
        onLongPress={() => handleMenu(item)}
        style={({ pressed }) => [s.row, pressed && { backgroundColor: theme.backgroundSecondary }]}
      >
        {/* Lift button: the floor at a glance, the way you'd look for it in the building. */}
        <View style={[s.liftBtn, { borderColor: floor.short ? theme.primary : theme.border }]}>
          {floor.short ? (
            <Text style={[s.liftText, { color: theme.primary }, floor.short.length > 2 && { fontSize: 11 }]} numberOfLines={1}>
              {floor.short}
            </Text>
          ) : (
            <View style={[s.liftDot, { backgroundColor: theme.border }]} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.code, { color: theme.text }]} numberOfLines={2}>
            {item.room_code}
            {item.room_label && item.room_label.toLowerCase() !== item.room_code.toLowerCase() ? (
              <Text style={[s.label, { color: theme.textSecondary }]}>{`  ${item.room_label}`}</Text>
            ) : null}
          </Text>
          {meta || item.description ? (
            <Text style={[s.meta, { color: theme.textSecondary }]} numberOfLines={2}>
              {meta}
              {meta && item.description ? '  ·  ' : ''}
              {item.description ? <Text style={s.directions}>“{item.description}”</Text> : null}
            </Text>
          ) : null}
        </View>
        <View style={s.rowRight}>
          {item.verified ? (
            <Feather name="check-circle" size={14} color="#16a34a" />
          ) : item.upvote_count > 0 ? (
            <Text style={s.confirmed}>✓ {item.upvote_count}</Text>
          ) : null}
          <Pressable hitSlop={12} onPress={() => handleMenu(item)}>
            <Feather name="more-horizontal" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  // Your campus leads the row with a pin; "All" and the rest follow.
  const ownCampus = userCampus ? campuses.find((c) => sameCampus(c.name, userCampus))?.name ?? null : null;
  const campusItems: (string | null)[] = ownCampus
    ? [ownCampus, null, ...campuses.map((c) => c.name).filter((n) => n !== ownCampus)]
    : [null, ...campuses.map((c) => c.name)];

  const Chip = ({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: any }) => (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: theme.primary }]}>
      {icon ? <Feather name={icon} size={12} color={active ? theme.textInverse : theme.textSecondary} /> : null}
      <Text style={[s.chipText, { color: active ? theme.textInverse : theme.textSecondary, fontWeight: active ? '700' : '500' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

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

      {/* Search first — people open this to find one specific room. */}
      {userUni ? (
        <View style={[s.searchWrap, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder={T('campusMapSearchPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="characters"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Feather name="x-circle" size={16} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showCampusFilter ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipBar} contentContainerStyle={s.chipRow}>
          {campusItems.map((c) => (
            <Chip
              key={c ?? '__all__'}
              label={c === null ? T('confessionAllCampuses') : campusShort(c)}
              active={selectedCampus === c}
              icon={c !== null && c === ownCampus ? 'map-pin' : undefined}
              onPress={() => handleSelectCampus(c)}
            />
          ))}
        </ScrollView>
      ) : null}

      {facultyOptions.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipBar} contentContainerStyle={s.chipRow}>
          <Chip label={T('campusMapAllFaculties')} active={selectedFaculty === null} onPress={() => setSelectedFaculty(null)} />
          {facultyOptions.map((f) => (
            <Chip
              key={f}
              label={f}
              active={!!selectedFaculty && facultyKey(selectedFaculty) === facultyKey(f)}
              icon={userFaculty && facultyKey(userFaculty) === facultyKey(f) ? 'bookmark' : undefined}
              onPress={() => setSelectedFaculty(f)}
            />
          ))}
        </ScrollView>
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
          renderSectionHeader={({ section }) =>
            section.title ? (
              // Directory board, like the sign at a faculty's entrance.
              <View style={[s.board, { backgroundColor: theme.primary }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.boardKicker, { color: theme.textInverse }]}>DIRECTORY</Text>
                  <Text style={[s.boardTitle, { color: theme.textInverse }]} numberOfLines={2}>{section.title}</Text>
                  <Text style={[s.boardCount, { color: theme.textInverse }]}>
                    {section.data.length} {section.data.length === 1 ? 'room' : 'rooms'}
                  </Text>
                </View>
                {(section as Section).mapUrl ? (
                  <Pressable
                    onPress={() => void WebBrowser.openBrowserAsync((section as Section).mapUrl!)}
                    style={({ pressed }) => [s.boardBtn, { backgroundColor: theme.textInverse }, pressed && { opacity: 0.85 }]}
                  >
                    <Feather name="map" size={14} color={theme.primary} />
                    <Text style={[s.boardBtnText, { color: theme.primary }]}>{T('campusMapViewMap')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={[s.separator, { backgroundColor: theme.border }]} />}
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
          <Feather name="plus" size={20} color="#fff" />
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

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },

  chipBar: { flexGrow: 0, flexShrink: 0 },
  chipRow: { paddingHorizontal: 12, paddingTop: 8, gap: 2, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  chipText: { fontSize: 14 },

  listContent: { paddingBottom: 110, paddingTop: 4 },
  board: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
    marginHorizontal: 16, marginTop: 18, marginBottom: 4,
    paddingHorizontal: 18, paddingVertical: 16, borderRadius: 18,
  },
  boardKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, opacity: 0.55 },
  boardTitle: { fontSize: 26, fontWeight: '900', letterSpacing: -0.8, marginTop: 2 },
  boardCount: { fontSize: 13, fontWeight: '600', opacity: 0.7, marginTop: 2 },
  boardBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17 },
  boardBtnText: { fontSize: 13, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  liftBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  liftText: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  liftDot: { width: 5, height: 5, borderRadius: 3 },
  code: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  label: { fontSize: 14, fontWeight: '500', letterSpacing: 0 },
  meta: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  directions: { fontStyle: 'italic' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  confirmed: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 70 },

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
