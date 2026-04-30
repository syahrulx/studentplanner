import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';
import type { CommunityPost, PostType } from '@/src/lib/eventsApi';
import { Avatar } from '@/components/Avatar';

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_PILLS: { label: string; value: PostType | null; icon: string }[] = [
  { label: 'All', value: null, icon: 'grid' },
  { label: 'Events', value: 'event', icon: 'calendar' },
  { label: 'Memos', value: 'memo', icon: 'file-text' },
];

const TYPE_META: Record<PostType, { label: string; icon: string; tint: string }> = {
  event: { label: 'Event', icon: 'calendar', tint: '#0A84FF' },
  service: { label: 'Service', icon: 'tool', tint: '#FF9F0A' },
  memo: { label: 'Memo', icon: 'file-text', tint: '#BF5AF2' },
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function parseEventDate(yyyymmdd?: string | null) {
  if (!yyyymmdd) return null;
  const parts = yyyymmdd.split('-').map(Number);
  if (parts.length < 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return {
    month: MONTHS[m - 1],
    monthLong: MONTHS_LONG[m - 1],
    day: String(d).padStart(2, '0'),
    weekday: WEEKDAYS[date.getDay()],
    full: `${WEEKDAYS[date.getDay()]}, ${MONTHS_LONG[m - 1]} ${d}`,
  };
}

function formatTime(t?: string | null): string | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(Number.isNaN(m) ? 0 : m).padStart(2, '0')} ${period}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function EventsBoard() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const CARD_WIDTH = (width - 32 - 12) / 2; // 32 for padding (16*2), 12 for gap
  const { user } = useApp();
  const dark = isDarkTheme(theme.id);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<PostType | null>(null);
  const [authorityStatus, setAuthorityStatus] = useState<string | null>(null);

  const userUni = (user as any)?.university_id || (user as any)?.universityId || null;

  // Advanced filters
  const [filterUniversity, setFilterUniversity] = useState<string | null>(null);
  const [filterCampusId, setFilterCampusId] = useState<string | null>(null);
  const [filterOrgId, setFilterOrgId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<string | null>(null);

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempUni, setTempUni] = useState<string | null>(null);
  const [tempCampusId, setTempCampusId] = useState<string | null>(null);
  const [tempOrgId, setTempOrgId] = useState<string | null>(null);
  const [tempDate, setTempDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [universities, setUniversities] = useState<eventsApi.University[]>([]);
  const [campuses, setCampuses] = useState<eventsApi.Campus[]>([]);
  const [organizations, setOrganizations] = useState<eventsApi.Organization[]>([]);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerData, setPickerData] = useState<{ id: string; name: string }[]>([]);
  const [pickerTitle, setPickerTitle] = useState('');
  const [pickerOnSelect, setPickerOnSelect] = useState<(id: string) => void>(() => () => {});

  const activeUni = filterUniversity !== null ? filterUniversity : userUni;
  const hasAdvancedFilter = filterUniversity !== null || !!filterCampusId || !!filterOrgId || !!filterDate;

  useEffect(() => {
    eventsApi.fetchUniversities().then(setUniversities);
  }, []);

  const currentUniToFetch = showFilterModal ? tempUni : activeUni;

  // Fetch campuses and organizations when active filter university changes
  useEffect(() => {
    if (currentUniToFetch) {
      Promise.all([
        eventsApi.fetchCampuses(currentUniToFetch),
        eventsApi.fetchOrganizations(currentUniToFetch)
      ]).then(([camps, orgs]) => {
        setCampuses(camps);
        setOrganizations(orgs);
      });
    } else {
      setCampuses([]);
      setOrganizations([]);
    }
  }, [currentUniToFetch]);

  const renderPickerContent = () => (
    <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
      <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={e => e.stopPropagation()}>
        <View style={styles.grabber} />
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{pickerTitle}</Text>
        </View>
        <FlatList
          data={pickerData}
          keyExtractor={item => item.id}
          style={{ maxHeight: 400 }}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.sheetItem, { borderBottomColor: theme.border }]}
              onPress={() => {
                pickerOnSelect(item.id);
                setPickerVisible(false);
              }}
            >
              <Text style={[styles.sheetItemText, { color: theme.text }]}>{item.name}</Text>
            </Pressable>
          )}
        />
      </Pressable>
    </Pressable>
  );

  const loadPosts = useCallback(async () => {
    try {
      const data = await eventsApi.fetchPosts({
        postType: filter,
        universityId: activeUni,
        campusId: filterCampusId,
        organizationId: filterOrgId,
        date: filterDate,
      });
      setPosts(data);
    } catch (e) {
      console.error('[EventsBoard] fetchPosts error:', e);
    }
  }, [filter, activeUni, filterCampusId, filterOrgId, filterDate]);

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

  // ─── Active filter chips (advanced) ───────────────────────────────────────
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (filterUniversity !== null) {
      chips.push({
        key: 'uni',
        label: filterUniversity ? filterUniversity.toUpperCase() : 'Any university',
        onClear: () => setFilterUniversity(null),
      });
    }
    if (filterCampusId) {
      const cName = campuses.find(c => c.id === filterCampusId)?.name || 'Campus';
      chips.push({ key: 'campus', label: cName, onClear: () => setFilterCampusId(null) });
    }
    if (filterOrgId) {
      const oName = organizations.find(o => o.id === filterOrgId)?.name || 'Organization';
      chips.push({ key: 'org', label: oName, onClear: () => setFilterOrgId(null) });
    }
    if (filterDate) {
      const p = parseEventDate(filterDate);
      chips.push({
        key: 'date',
        label: p ? p.full : filterDate,
        onClear: () => setFilterDate(null),
      });
    }
    return chips;
  }, [filterUniversity, filterCampusId, filterOrgId, filterDate, campuses, organizations]);

  // ─── Header: scrollable pills + pinned action buttons ────────────────────
  const Header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {/* Scrollable type pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContent}
          style={{ flex: 1 }}
        >
          {TYPE_PILLS.map((pill) => {
            const active = filter === pill.value;
            return (
              <Pressable
                key={pill.label}
                onPress={() => setFilter(pill.value)}
                style={({ pressed }) => [
                  styles.pill,
                  active
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { backgroundColor: theme.card, borderColor: theme.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: active ? theme.textInverse : theme.textSecondary },
                  ]}
                >
                  {pill.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Pinned action buttons */}
        <View style={[styles.headerActions, { backgroundColor: theme.background }]}>
          <Pressable
            onPress={() => {
              setTempUni(filterUniversity !== null ? filterUniversity : userUni || null);
              setTempCampusId(filterCampusId);
              setTempOrgId(filterOrgId);
              setTempDate(filterDate);
              setShowFilterModal(true);
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Filter events"
          >
            <Feather name="sliders" size={18} color={theme.text} />
            {hasAdvancedFilter && (
              <View style={[styles.iconBtnDot, { backgroundColor: theme.primary }]} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Active advanced filter chips */}
      {activeChips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {activeChips.map((c) => (
            <View
              key={c.key}
              style={[
                styles.activeChip,
                { backgroundColor: theme.primary + '14', borderColor: theme.primary + '33' },
              ]}
            >
              <Text style={[styles.activeChipText, { color: theme.primary }]} numberOfLines={1}>
                {c.label}
              </Text>
              <Pressable onPress={c.onClear} hitSlop={8}>
                <Feather name="x" size={13} color={theme.primary} />
              </Pressable>
            </View>
          ))}
          <Pressable
            onPress={() => {
              setFilterUniversity(null);
              setFilterCampusId(null);
              setFilterOrgId(null);
              setFilterDate(null);
            }}
            style={[styles.activeChip, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.activeChipText, { color: theme.textSecondary }]}>Clear all</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );

  // ─── Render Event Poster Card ──────────────────────────────────────────────
  const renderCard = useCallback(
    ({ item }: { item: any }) => {
      const meta = TYPE_META[item.post_type as keyof typeof TYPE_META] || TYPE_META.other;
      const eventDate = parseEventDate(item.event_date);
      const isOwn = user?.id === item.author_id;
      const orgName = item.organization_id ? organizations.find(o => o.id === item.organization_id)?.name || 'Organization' : null;
      const uniName = item.university_id ? item.university_id.toUpperCase() : 'Community';

      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            {
              width: CARD_WIDTH,
              backgroundColor: theme.card,
              borderColor: theme.border,
              shadowColor: dark ? '#000' : '#0f172a',
            },
            pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
          ]}
          onPress={() => {
            if (isOwn) {
              router.push({ pathname: '/community/create-post', params: { editId: item.id } } as any);
            } else {
              router.push({ pathname: '/community/post-detail', params: { postId: item.id } } as any);
            }
          }}
        >
          {/* Poster Image */}
          {item.image_url ? (
            <View style={styles.heroWrap}>
              <Image source={{ uri: item.image_url }} style={styles.heroImage} resizeMode="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)']}
                style={styles.heroOverlay}
                pointerEvents="none"
              />

              {/* Top badges */}
              <View style={styles.heroTopRow} pointerEvents="none">
                {item.pinned && (
                  <View style={[styles.heroBadge, { backgroundColor: theme.card + 'E8' }]}>
                    <Feather name="bookmark" size={10} color={theme.text} />
                  </View>
                )}
                <View style={[styles.heroBadge, { backgroundColor: theme.card + 'E8' }]}>
                  <Feather name={meta.icon as any} size={10} color={meta.tint} />
                </View>
              </View>

              {/* Date Capsule */}
              {eventDate && (
                <View style={styles.heroBottomRow} pointerEvents="none">
                  <View style={[styles.dateCapsule, { backgroundColor: theme.card + 'F0' }]}>
                    <Text style={[styles.dateCapsuleMonth, { color: meta.tint }]}>{eventDate.month}</Text>
                    <Text style={[styles.dateCapsuleDay, { color: theme.text }]}>{eventDate.day}</Text>
                  </View>
                </View>
              )}
            </View>
          ) : (
            // No Image placeholder (just fill the space nicely)
            <View style={[styles.heroWrap, { backgroundColor: meta.tint + '15', justifyContent: 'center', alignItems: 'center' }]}>
              <Feather name={meta.icon as any} size={32} color={meta.tint + '50'} />
              {eventDate && (
                <View style={[styles.heroBottomRow, { left: 8, bottom: 8 }]} pointerEvents="none">
                  <View style={[styles.dateCapsule, { backgroundColor: theme.card }]}>
                    <Text style={[styles.dateCapsuleMonth, { color: meta.tint }]}>{eventDate.month}</Text>
                    <Text style={[styles.dateCapsuleDay, { color: theme.text }]}>{eventDate.day}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Compact Info Body */}
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            
            <Text style={[styles.authorMeta, { color: theme.textSecondary }]} numberOfLines={1}>
              {orgName || uniName}
            </Text>
          </View>
        </Pressable>
      );
    },
    [theme, user, dark, campuses, organizations]
  );

  // ─── Empty State ──────────────────────────────────────────────────────────
  const Empty = (
    <View style={styles.emptyState}>
      <View
        style={[
          styles.emptyIconWrap,
          { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
        ]}
      >
        <Feather name="calendar" size={26} color={theme.textSecondary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No posts yet</Text>
      <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
        Events, services and memos shared with your university will appear here.
      </Text>
    </View>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {loading ? (
        <View style={{ flex: 1 }}>
          {Header}
          <View style={styles.center}>
            <ActivityIndicator size="small" color={theme.textSecondary} />
          </View>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          renderItem={renderCard}
          style={{ backgroundColor: theme.background }}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={Header}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.textSecondary}
            />
          }
          ListEmptyComponent={Empty}
        />
      )}

      {/* ─── Filter Modal (iOS-style sheet) ─── */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilterModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterModal(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.grabber} />

            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setShowFilterModal(false)} hitSlop={10}>
                <Text style={[styles.sheetCancel, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Filters</Text>
              <Pressable
                onPress={() => {
                  setTempUni(null);
                  setTempCampusId(null);
                  setTempOrgId(null);
                  setTempDate(null);
                }}
                hitSlop={10}
              >
                <Text
                  style={[
                    styles.sheetReset,
                    { color: theme.primary, opacity: tempUni || tempCampusId || tempOrgId || tempDate ? 1 : 0.3 },
                  ]}
                >
                  Reset
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 520 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>UNIVERSITY</Text>
              <Pressable
                style={[
                  styles.inputRow,
                  { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                ]}
                onPress={() => {
                  setPickerTitle('Select University');
                  setPickerData([{ id: '', name: 'Any University' }, ...universities]);
                  setPickerOnSelect(() => (id: string) => {
                    setTempUni(id || null);
                    setTempCampusId(null);
                    setTempOrgId(null);
                  });
                  setPickerVisible(true);
                }}
              >
                <Feather name="award" size={16} color={theme.textSecondary} />
                <Text style={[styles.input, { color: tempUni ? theme.text : theme.textSecondary }]}>
                  {tempUni ? universities.find(u => u.id === tempUni)?.name || tempUni.toUpperCase() : 'Any University'}
                </Text>
                {tempUni ? (
                  <Pressable onPress={() => { setTempUni(null); setTempCampusId(null); setTempOrgId(null); }} hitSlop={6}>
                    <Feather name="x-circle" size={16} color={theme.textSecondary} />
                  </Pressable>
                ) : null}
              </Pressable>

              {tempUni && (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CAMPUS</Text>
                  <Pressable
                    style={[
                      styles.inputRow,
                      { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                    ]}
                    onPress={() => {
                      setPickerTitle('Select Campus');
                      setPickerData([{ id: '', name: 'Any Campus' }, ...campuses]);
                      setPickerOnSelect(() => (id: string) => {
                        setTempCampusId(id || null);
                        setTempOrgId(null);
                      });
                      setPickerVisible(true);
                    }}
                  >
                    <Feather name="map-pin" size={16} color={theme.textSecondary} />
                    <Text style={[styles.input, { color: tempCampusId ? theme.text : theme.textSecondary }]}>
                      {tempCampusId ? campuses.find(c => c.id === tempCampusId)?.name : 'Any Campus'}
                    </Text>
                    {tempCampusId ? (
                      <Pressable onPress={() => { setTempCampusId(null); setTempOrgId(null); }} hitSlop={6}>
                        <Feather name="x-circle" size={16} color={theme.textSecondary} />
                      </Pressable>
                    ) : null}
                  </Pressable>

                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>ORGANIZATION / CLUB</Text>
                  <Pressable
                    style={[
                      styles.inputRow,
                      { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                    ]}
                    onPress={() => {
                      const orgs = organizations.filter(o => !o.campus_id || o.campus_id === tempCampusId);
                      setPickerTitle('Select Organization');
                      setPickerData([{ id: '', name: 'Any Organization' }, ...orgs]);
                      setPickerOnSelect(() => (id: string) => setTempOrgId(id || null));
                      setPickerVisible(true);
                    }}
                  >
                    <Feather name="users" size={16} color={theme.textSecondary} />
                    <Text style={[styles.input, { color: tempOrgId ? theme.text : theme.textSecondary }]}>
                      {tempOrgId ? organizations.find(o => o.id === tempOrgId)?.name : 'Any Organization'}
                    </Text>
                    {tempOrgId ? (
                      <Pressable onPress={() => setTempOrgId(null)} hitSlop={6}>
                        <Feather name="x-circle" size={16} color={theme.textSecondary} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                </>
              )}

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>EVENT DATE</Text>

              <Pressable
                onPress={() => setShowDatePicker((v) => !v)}
                style={[
                  styles.inputRow,
                  { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                ]}
              >
                <Feather name="calendar" size={16} color={theme.textSecondary} />
                <Text
                  style={[
                    styles.input,
                    { color: tempDate ? theme.text : theme.textSecondary, paddingVertical: 0 },
                  ]}
                >
                  {tempDate ? parseEventDate(tempDate)?.full || tempDate : 'Any date'}
                </Text>
                {tempDate ? (
                  <Pressable onPress={() => setTempDate(null)} hitSlop={6}>
                    <Feather name="x-circle" size={16} color={theme.textSecondary} />
                  </Pressable>
                ) : (
                  <Feather
                    name={showDatePicker ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={theme.textSecondary}
                  />
                )}
              </Pressable>

              {Platform.OS === 'ios' && showDatePicker && (
                <View
                  style={[
                    styles.pickerWrap,
                    { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                  ]}
                >
                  <DateTimePicker
                    value={tempDate ? new Date(tempDate) : new Date()}
                    mode="date"
                    display="inline"
                    themeVariant={dark ? 'dark' : 'light'}
                    accentColor={theme.primary}
                    onChange={(_, selectedDate) => {
                      if (selectedDate) setTempDate(selectedDate.toISOString().split('T')[0]);
                    }}
                  />
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
            </ScrollView>

            <Pressable
              style={({ pressed }) => [
                styles.applyBtn,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                setFilterUniversity(tempUni || null);
                setFilterCampusId(tempCampusId || null);
                setFilterOrgId(tempOrgId || null);
                setFilterDate(tempDate);
                setShowFilterModal(false);
                setShowDatePicker(false);
              }}
            >
              <Text style={[styles.applyBtnText, { color: theme.textInverse }]}>Apply Filters</Text>
            </Pressable>
          </Pressable>
        </Pressable>
        {pickerVisible && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
            {renderPickerContent()}
          </View>
        )}
      </Modal>

      {/* Reusable Picker Modal (used only when Filter modal is closed) */}
      <Modal visible={pickerVisible && !showFilterModal} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        {renderPickerContent()}
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  // Header
  header: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingRight: 4,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 16,
    paddingLeft: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnFilled: { borderWidth: 0 },
  iconBtnDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  // Active filter chips
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 16,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  activeChipText: { fontSize: 12, fontWeight: '600', maxWidth: 180 },

  // List
  listContent: { paddingBottom: 120 },

  // Card (Poster format)
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
    overflow: 'hidden',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  // Hero (Poster A4 aspect ratio)
  heroWrap: { width: '100%', aspectRatio: 210 / 297, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  heroTopRow: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 6,
  },
  heroBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  heroBottomRow: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
  },
  dateCapsule: {
    width: 44,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 5,
    overflow: 'hidden',
  },
  dateCapsuleMonth: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  dateCapsuleDay: { fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: -0.5, lineHeight: 18 },
  heroTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  heroTypeChipText: { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },

  // No-image header
  cardHeaderNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeChipText: { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },
  cardHeaderBadges: { flexDirection: 'row', gap: 6 },
  miniChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  miniChipText: { fontSize: 10, fontWeight: '700' },

  // Card body
  cardBody: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12 },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  authorMeta: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: -0.1,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 13, fontWeight: '500', flex: 1, letterSpacing: -0.1 },

  hairline: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  authorName: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  authorMeta: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 280,
    letterSpacing: -0.1,
  },

  // Modal / Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(120,120,128,0.4)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  sheetCancel: { fontSize: 15, fontWeight: '500' },
  sheetReset: { fontSize: 15, fontWeight: '600' },

  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
    paddingLeft: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
  pickerWrap: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  applyBtn: {
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  sheetItem: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetItemText: { fontSize: 16 },
});
