import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { useApp } from '@/src/context/AppContext';
import { Avatar } from '@/components/Avatar';
import * as servicesApi from '@/src/lib/servicesApi';
import type {
  ServicePost,
  ServiceKind,
  ServiceStatus,
} from '@/src/lib/servicesApi';
import { SERVICE_CATEGORIES, getCategory, formatPrice, statusMeta, getStudentVerificationStatus } from '@/src/lib/servicesApi';
import * as eventsApi from '@/src/lib/eventsApi';
import StudentVerificationModal from '@/components/StudentVerificationModal';

// ─── Types ──────────────────────────────────────────────────────────────────

type Scope = 'all' | 'mine' | 'taken';

const SCOPE_TABS: { id: Scope; label: string }[] = [
  { id: 'all',   label: 'Browse' },
  { id: 'mine',  label: 'My Requests' },
  { id: 'taken', label: 'My Tasks' },
];

const KIND_FILTERS: { id: ServiceKind | null; label: string }[] = [
  { id: null,      label: 'All' },
  { id: 'request', label: 'Requests' },
  { id: 'offer',   label: 'Offers' },
];

const SORT_FILTER_OPTIONS: {
  id: 'newest' | 'price_asc' | 'price_desc' | 'deadline_asc';
  label: string;
}[] = [
  { id: 'newest', label: 'Newest (default)' },
  { id: 'price_asc', label: 'Price: Low to High' },
  { id: 'price_desc', label: 'Price: High to Low' },
  { id: 'deadline_asc', label: 'Deadline: Ending soonest' },
];

// ─── Utils ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ServicesBoard() {
  const theme = useTheme();
  const dark = isDarkTheme(theme.id);
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const userId = user?.id || null;
  const userUni = (user as any)?.university_id || (user as any)?.universityId || null;
  const userCampusName = ((user as any)?.campus ?? '').trim() || null;
  // Match GlassTabBar height: 8 (top padding) + 64 (bar) + bottom inset (≥12).
  const tabBarTotal = 8 + 64 + Math.max(insets.bottom, 12);

  const [scope, setScope] = useState<Scope>('all');
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [kind, setKind] = useState<ServiceKind | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [status] = useState<ServiceStatus | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [orderBy, setOrderBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'deadline_asc'>('newest');

  // Location filter state (aligned with Events: default uni = profile; campus optional id → name for API)
  const [filterUniversity, setFilterUniversity] = useState<string | null>(null);
  const [filterCampusId, setFilterCampusId] = useState<string | null>(null);
  const [universities, setUniversities] = useState<eventsApi.University[]>([]);
  const [campuses, setCampuses] = useState<eventsApi.Campus[]>([]);

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempOrderBy, setTempOrderBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'deadline_asc'>('newest');
  const [tempKind, setTempKind] = useState<ServiceKind | null>(null);
  const [tempCategory, setTempCategory] = useState<string | null>(null);
  const [tempFilterUniversity, setTempFilterUniversity] = useState<string | null>(null);
  const [tempFilterCampusId, setTempFilterCampusId] = useState<string | null>(null);
  const [uniSearchQuery, setUniSearchQuery] = useState('');
  const [campusSearchQuery, setCampusSearchQuery] = useState('');
  const [uniPickerExpanded, setUniPickerExpanded] = useState(true);
  const [campusPickerExpanded, setCampusPickerExpanded] = useState(false);

  /** Once true, we do not auto-set campus from profile again (user may have cleared). */
  const campusProfileBootstrapDone = useRef(false);

  const [items, setItems] = useState<ServicePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Debounce the search query so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    async function checkIntro() {
      try {
        const seen = await AsyncStorage.getItem('has_seen_services_intro');
        if (!seen) {
          setShowIntroModal(true);
          await AsyncStorage.setItem('has_seen_services_intro', '1');
        }
      } catch (e) {}
    }
    checkIntro();
  }, []);

  useEffect(() => {
    eventsApi.fetchUniversities().then(setUniversities);
  }, []);

  const activeUni = filterUniversity !== null ? filterUniversity : userUni;

  const currentUniToFetch = showFilterModal ? tempFilterUniversity : activeUni;

  useEffect(() => {
    if (currentUniToFetch) {
      eventsApi.fetchCampuses(currentUniToFetch).then(setCampuses);
    } else {
      setCampuses([]);
    }
  }, [currentUniToFetch]);

  useEffect(() => {
    setCampusSearchQuery('');
    setCampusPickerExpanded(false);
  }, [tempFilterUniversity]);

  /** Default campus filter from profile (same uni + name match), once. */
  useEffect(() => {
    if (campusProfileBootstrapDone.current || !userUni || !userCampusName) return;
    let cancelled = false;
    eventsApi.fetchCampuses(userUni).then((camps) => {
      if (cancelled) return;
      campusProfileBootstrapDone.current = true;
      const m = camps.find((c) => c.name.trim().toLowerCase() === userCampusName.toLowerCase());
      if (m) setFilterCampusId(m.id);
    });
    return () => {
      cancelled = true;
    };
  }, [userUni, userCampusName]);

  useEffect(() => {
    if (!filterCampusId || !campuses.length) return;
    if (!campuses.some((c) => c.id === filterCampusId)) setFilterCampusId(null);
  }, [activeUni, campuses, filterCampusId]);

  const filteredUniversitiesList = useMemo(() => {
    const q = uniSearchQuery.trim().toLowerCase();
    let list = universities;
    if (q) {
      list = universities.filter(
        (u) => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)
      );
    } else if (userUni && showFilterModal) {
      list = [...universities].sort((a, b) => {
        if (a.id === userUni) return -1;
        if (b.id === userUni) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [universities, uniSearchQuery, userUni, showFilterModal]);

  const filteredCampusesList = useMemo(() => {
    const q = campusSearchQuery.trim().toLowerCase();
    if (!campuses.length) return [];
    if (!q) return [...campuses].sort((a, b) => a.name.localeCompare(b.name));
    return campuses.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }, [campuses, campusSearchQuery]);

  const campusNameForQuery = useMemo(() => {
    if (!filterCampusId) return undefined;
    return campuses.find((c) => c.id === filterCampusId)?.name;
  }, [filterCampusId, campuses]);

  const load = useCallback(async () => {
    try {
      const data = await servicesApi.fetchServices({
        scope,
        kind,
        category,
        status,
        search: debouncedSearch || null,
        orderBy,
        universityId: scope === 'all' ? (activeUni || undefined) : undefined,
        campus: scope === 'all' ? campusNameForQuery : undefined,
      });
      const filtered = scope === 'all' && !status
        ? data.filter((s) => s.service_status !== 'cancelled')
        : data;
      setItems(filtered);
    } catch (e) {
      console.error('[ServicesBoard] fetch error:', e);
    }
  }, [scope, kind, category, status, debouncedSearch, orderBy, activeUni, campusNameForQuery]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /** Gate: check student verification before allowing service creation. */
  const handleNewService = useCallback(async () => {
    try {
      const { status: vStatus } = await getStudentVerificationStatus();
      if (vStatus === 'verified') {
        router.push('/services/new' as any);
      } else {
        setShowVerificationModal(true);
      }
    } catch {
      // On error, fall back to showing the modal
      setShowVerificationModal(true);
    }
  }, []);
  // ─── Counts for scope tabs ────────────────────────────────────────────────
  const [mineCount, setMineCount] = useState<number | null>(null);
  const [takenCount, setTakenCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      Promise.all([
        servicesApi.fetchServices({ scope: 'mine', limit: 200 }),
        servicesApi.fetchServices({ scope: 'taken', limit: 200 }),
      ])
        .then(([mine, taken]) => {
          setMineCount(mine.filter((s) => s.service_status !== 'completed' && s.service_status !== 'cancelled').length);
          setTakenCount(taken.filter((s) => s.service_status === 'claimed' || s.service_status === 'submitted').length);
        })
        .catch(() => {});
    }, [userId])
  );

  // ─── Browse filters (grouped sheet + chips, same pattern as Events) ───────

  const hasActiveBrowseFilters = useMemo(
    () =>
      orderBy !== 'newest' ||
      kind !== null ||
      category !== null ||
      filterUniversity !== null ||
      filterCampusId !== null,
    [orderBy, kind, category, filterUniversity, filterCampusId]
  );

  const activeBrowseChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (orderBy !== 'newest') {
      const sortLabel =
        orderBy === 'price_asc'
          ? 'Sort: Low → High'
          : orderBy === 'price_desc'
            ? 'Sort: High → Low'
            : orderBy === 'deadline_asc'
              ? 'Sort: Ending soon'
              : 'Sort';
      chips.push({ key: 'sort', label: sortLabel, onClear: () => setOrderBy('newest') });
    }
    if (filterCampusId) {
      const cn = campuses.find((c) => c.id === filterCampusId)?.name ?? 'Campus';
      chips.push({
        key: 'campus',
        label: cn,
        onClear: () => {
          setFilterCampusId(null);
          campusProfileBootstrapDone.current = true;
        },
      });
    } else if (filterUniversity !== null) {
      chips.push({
        key: 'uni',
        label: universities.find((u) => u.id === filterUniversity)?.name?.toUpperCase() ?? filterUniversity.toUpperCase(),
        onClear: () => {
          setFilterUniversity(null);
          setFilterCampusId(null);
        },
      });
    }
    if (kind !== null) {
      const kl = KIND_FILTERS.find((k) => k.id === kind)?.label ?? '';
      chips.push({ key: 'kind', label: kl, onClear: () => setKind(null) });
    }
    if (category) {
      const cat = SERVICE_CATEGORIES.find((c) => c.id === category);
      chips.push({
        key: 'cat',
        label: cat?.label ?? category,
        onClear: () => setCategory(null),
      });
    }
    return chips;
  }, [orderBy, filterUniversity, filterCampusId, kind, category, campuses, universities]);

  const openServicesFilterModal = useCallback(() => {
    setTempOrderBy(orderBy);
    setTempKind(kind);
    setTempCategory(category);
    const nextUni = filterUniversity !== null ? filterUniversity : userUni || null;
    setTempFilterUniversity(nextUni);
    setTempFilterCampusId(filterCampusId);
    setUniSearchQuery('');
    setCampusSearchQuery('');
    setUniPickerExpanded(!nextUni);
    setCampusPickerExpanded(false);
    setShowFilterModal(true);
  }, [orderBy, kind, category, filterUniversity, filterCampusId, userUni]);

  const resetTempFilters = useCallback(() => {
    setTempOrderBy('newest');
    setTempKind(null);
    setTempCategory(null);
    setTempFilterUniversity(null);
    setTempFilterCampusId(null);
    setUniSearchQuery('');
    setCampusSearchQuery('');
    setUniPickerExpanded(true);
    setCampusPickerExpanded(false);
  }, []);

  const tempHasActiveSettings = useMemo(
    () =>
      tempOrderBy !== 'newest' ||
      tempKind !== null ||
      tempCategory !== null ||
      tempFilterUniversity !== null ||
      tempFilterCampusId !== null ||
      !!uniSearchQuery.trim() ||
      !!campusSearchQuery.trim(),
    [tempOrderBy, tempKind, tempCategory, tempFilterUniversity, tempFilterCampusId, uniSearchQuery, campusSearchQuery]
  );

  const renderHeader = () => (
    <View style={styles.headerWrap}>
      {/* Search */}
      <View style={styles.headerInset}>
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search services"
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Feather name="x-circle" size={16} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {/* Scope tabs + filter control (Browse: sliders on the right, same row as tabs) */}
        <View style={styles.scopeRow}>
          <View style={[styles.scopeBar, { backgroundColor: theme.backgroundSecondary, flex: 1 }]}>
            {SCOPE_TABS.map((s) => {
              const active = scope === s.id;
              const count = s.id === 'mine' ? mineCount : s.id === 'taken' ? takenCount : null;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setScope(s.id)}
                  style={[
                    styles.scopeTab,
                    active && { backgroundColor: theme.card },
                  ]}
                >
                  <Text
                    style={[
                      styles.scopeText,
                      { color: active ? theme.text : theme.textSecondary },
                    ]}
                  >
                    {s.label}
                  </Text>
                  {count != null && count > 0 && (
                    <View style={[styles.scopeBadge, { backgroundColor: active ? theme.text : theme.textSecondary }]}>
                      <Text style={[styles.scopeBadgeText, { color: theme.background }]}>
                        {count}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          {scope === 'all' && (
            <View style={[styles.scopeHeaderActions, { backgroundColor: theme.background }]}>
              <Pressable
                onPress={openServicesFilterModal}
                style={({ pressed }) => [
                  styles.filterIconBtn,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel="Filter and sort services"
              >
                <Feather name="sliders" size={18} color={theme.text} />
                {hasActiveBrowseFilters && (
                  <View style={[styles.filterIconBtnDot, { backgroundColor: theme.primary }]} />
                )}
              </Pressable>
            </View>
          )}
        </View>

        {scope === 'all' && activeBrowseChips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.browseChipsRow}
          >
            {activeBrowseChips.map((c) => (
              <View
                key={c.key}
                style={[
                  styles.browseActiveChip,
                  { backgroundColor: theme.primary + '14', borderColor: theme.primary + '33' },
                ]}
              >
                <Text style={[styles.browseActiveChipText, { color: theme.primary }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Pressable onPress={c.onClear} hitSlop={8}>
                  <Feather name="x" size={13} color={theme.primary} />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => {
                setOrderBy('newest');
                setKind(null);
                setCategory(null);
                setFilterUniversity(null);
                setFilterCampusId(null);
                campusProfileBootstrapDone.current = true;
              }}
              style={[styles.browseActiveChip, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Text style={[styles.browseActiveChipText, { color: theme.textSecondary }]}>Clear all</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </View>
  );

  const renderCard = useCallback(
    ({ item }: { item: ServicePost }) => {
      const cat = getCategory(item.service_category);
      const sm = statusMeta(item.service_status);
      const isMine = item.author_id === userId;
      const iTook  = item.claimed_by === userId;

      return (
        <Pressable
          onPress={() => router.push({ pathname: '/services/[id]', params: { id: item.id } } as any)}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border, shadowColor: dark ? '#000' : '#0f172a' },
            pressed && { transform: [{ scale: 0.985 }], opacity: 0.97 },
          ]}
        >
          {item.image_url ? (
            <View style={styles.heroWrap}>
              <Image source={{ uri: item.image_url }} style={styles.heroImg} resizeMode="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.45)']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.heroTop}>
                <View style={[styles.kindChip, { backgroundColor: theme.card + 'E8' }]}>
                  <Feather
                    name={item.service_kind === 'offer' ? 'gift' : 'help-circle'}
                    size={11}
                    color={theme.text}
                  />
                  <Text style={[styles.kindChipText, { color: theme.text }]}>
                    {item.service_kind === 'offer' ? 'Offering' : 'Requesting'}
                  </Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: sm.bg, borderColor: sm.tint }]}>
                  <Text style={[styles.statusChipText, { color: sm.tint }]}>{sm.label}</Text>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.cardBody}>
            {!item.image_url && (
              <View style={styles.metaTopRow}>
                <View style={[styles.kindChipPlain, { borderColor: theme.border }]}>
                  <Feather
                    name={item.service_kind === 'offer' ? 'gift' : 'help-circle'}
                    size={11}
                    color={theme.text}
                  />
                  <Text style={[styles.kindChipText, { color: theme.text }]}>
                    {item.service_kind === 'offer' ? 'Offering' : 'Requesting'}
                  </Text>
                </View>
                <View style={[styles.statusChipPlain, { backgroundColor: sm.bg }]}>
                  <Text style={[styles.statusChipText, { color: sm.tint }]}>{sm.label}</Text>
                </View>
              </View>
            )}

            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, { color: theme.text, flex: 1 }]} numberOfLines={2}>
                {item.title}
              </Text>
              {(item.unread_chat_count ?? 0) > 0 && (
                <View style={styles.cardUnreadBadge}>
                  <Text style={styles.cardUnreadBadgeText}>{item.unread_chat_count}</Text>
                </View>
              )}
            </View>

            {item.body ? (
              <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              <View style={[styles.metaChip, { backgroundColor: cat.tint + '14' }]}>
                <Feather name={cat.icon as any} size={11} color={cat.tint} />
                <Text style={[styles.metaChipText, { color: cat.tint }]}>{cat.label}</Text>
              </View>

              <View style={[styles.metaChip, { backgroundColor: theme.backgroundSecondary }]}>
                <Text style={[styles.metaChipText, { color: theme.text }]}>
                  {formatPrice(item)}
                </Text>
              </View>

              {item.location ? (
                <View style={[styles.metaChip, { backgroundColor: theme.backgroundSecondary }]}>
                  <Feather name="map-pin" size={10} color={theme.text} />
                  <Text style={[styles.metaChipText, { color: theme.text }]} numberOfLines={1}>
                    {item.location}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.hairline, { backgroundColor: theme.border }]} />

            <View style={styles.footer}>
              <Avatar name={item.author_name} avatarUrl={item.author_avatar || undefined} size={26} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.authorName, { color: theme.text }]} numberOfLines={1}>
                  {isMine ? 'You' : item.author_name}
                  {iTook ? '  ·  You took this' : ''}
                </Text>
                <Text style={[styles.authorMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                  {timeAgo(item.created_at)}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            </View>
          </View>
        </Pressable>
      );
    },
    [theme, userId]
  );

  const Empty = (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Feather
          name={scope === 'mine' ? 'inbox' : scope === 'taken' ? 'briefcase' : 'compass'}
          size={26}
          color={theme.textSecondary}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {scope === 'mine'  ? 'No requests yet'
         : scope === 'taken' ? 'No tasks taken'
         : 'No services found'}
      </Text>
      <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
        {scope === 'mine'
          ? 'Post a request and the campus community can help.'
          : scope === 'taken'
          ? 'Claim a service to see it here.'
          : 'Try adjusting filters or be the first to post.'}
      </Text>
      {scope !== 'taken' && (
          <Pressable
            onPress={() => handleNewService()}
            style={({ pressed }) => [
              styles.emptyCta,
              { backgroundColor: theme.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather name="plus" size={16} color={theme.textInverse} />
            <Text style={[styles.emptyCtaText, { color: theme.textInverse }]}>Post a service</Text>
        </Pressable>
      )}

      {/* Intro Modal */}
      <Modal
        visible={showIntroModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIntroModal(false)}
      >
        <View style={styles.introOverlay}>
          <View style={[styles.introModal, { backgroundColor: theme.card, shadowColor: dark ? '#000' : '#888' }]}>
            <View style={[styles.introIconWrap, { backgroundColor: theme.primary + '15' }]}>
              <Feather name="briefcase" size={32} color={theme.primary} />
            </View>
            <Text style={[styles.introTitle, { color: theme.text }]}>Welcome to Services!</Text>
            <Text style={[styles.introDesc, { color: theme.textSecondary }]}>
              A secure, peer-to-peer marketplace built exclusively for verified students.
            </Text>
            
            <View style={styles.introList}>
              <View style={styles.introListItem}>
                <Feather name="shield" size={18} color={theme.primary} style={{ marginTop: 2 }} />
                <View style={styles.introListTextWrap}>
                  <Text style={[styles.introListTitle, { color: theme.text }]}>Student-Only Platform</Text>
                  <Text style={[styles.introListDesc, { color: theme.textSecondary }]}>Only verified students can request or accept services, ensuring a safe community.</Text>
                </View>
              </View>
              <View style={styles.introListItem}>
                <Feather name="check-circle" size={18} color={theme.primary} style={{ marginTop: 2 }} />
                <View style={styles.introListTextWrap}>
                  <Text style={[styles.introListTitle, { color: theme.text }]}>Trust & Reliability</Text>
                  <Text style={[styles.introListDesc, { color: theme.textSecondary }]}>Features include delivery attachments, revision limits, and deadline tracking.</Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={() => setShowIntroModal(false)}
              style={({ pressed }) => [
                styles.introBtn,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.introBtnText}>Get Started</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {loading && !items.length ? (
        <View style={{ flex: 1 }}>
          {renderHeader()}
          <View style={styles.center}>
            <ActivityIndicator color={theme.textSecondary} />
          </View>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderCard}
          ListHeaderComponent={renderHeader()}
          style={{ backgroundColor: theme.background }}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarTotal + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />
          }
          ListEmptyComponent={Empty}
        />
      )}

      {/* Floating compose */}
      <Pressable
        onPress={() => handleNewService()}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.primary, bottom: tabBarTotal + 16 },
          pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
        ]}
      >
        <Feather name="plus" size={22} color={theme.textInverse} />
      </Pressable>

      {/* Student Verification Gate */}
      <StudentVerificationModal
        visible={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerified={() => {
          setShowVerificationModal(false);
          router.push('/services/new' as any);
        }}
      />
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilterModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterModal(false)}>
          <Pressable
            style={[styles.filterSheet, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.grabber} />

            <View style={styles.filterSheetHeader}>
              <Pressable
                onPress={() => setShowFilterModal(false)}
                hitSlop={10}
                style={styles.filterSheetHeaderSide}
              >
                <Text style={[styles.sheetCancel, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Text style={[styles.filterSheetTitle, { color: theme.text }]}>Filters</Text>
              <Pressable
                onPress={resetTempFilters}
                hitSlop={10}
                style={[styles.filterSheetHeaderSide, { alignItems: 'flex-end' }]}
                disabled={!tempHasActiveSettings}
              >
                <Text
                  style={[
                    styles.sheetReset,
                    { color: theme.primary, opacity: tempHasActiveSettings ? 1 : 0.35 },
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
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>SORT</Text>
              {SORT_FILTER_OPTIONS.map((opt) => {
                const sel = tempOrderBy === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setTempOrderBy(opt.id)}
                    style={[
                      styles.filterOptionRow,
                      {
                        backgroundColor: theme.backgroundSecondary,
                        borderColor: sel ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.filterOptionLabel, { color: theme.text }]}>{opt.label}</Text>
                    {sel ? <Feather name="check" size={18} color={theme.primary} /> : null}
                  </Pressable>
                );
              })}

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>TYPE</Text>
              {KIND_FILTERS.map((kf) => {
                const sel = tempKind === kf.id;
                return (
                  <Pressable
                    key={String(kf.id)}
                    onPress={() => setTempKind(kf.id)}
                    style={[
                      styles.filterOptionRow,
                      {
                        backgroundColor: theme.backgroundSecondary,
                        borderColor: sel ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.filterOptionLabel, { color: theme.text }]}>{kf.label}</Text>
                    {sel ? <Feather name="check" size={18} color={theme.primary} /> : null}
                  </Pressable>
                );
              })}

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>UNIVERSITY</Text>
              <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
                Defaults to your university; type to search or pick from the list.
              </Text>
              {tempFilterUniversity && !uniPickerExpanded ? (
                <View
                  style={[
                    styles.filterCollapsedRow,
                    { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                  ]}
                >
                  <Feather name="award" size={16} color={theme.primary} />
                  <Text style={[styles.filterCollapsedTitle, { color: theme.text }]} numberOfLines={2}>
                    {universities.find((u) => u.id === tempFilterUniversity)?.name ||
                      tempFilterUniversity.toUpperCase()}
                  </Text>
                  <Pressable onPress={() => setUniPickerExpanded(true)} hitSlop={8}>
                    <Text style={[styles.filterChangeLink, { color: theme.primary }]}>Change</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setTempFilterUniversity(null);
                      setTempFilterCampusId(null);
                      setUniPickerExpanded(true);
                    }}
                    hitSlop={6}
                  >
                    <Feather name="x-circle" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
              ) : null}
              {(!tempFilterUniversity || uniPickerExpanded) && (
                <>
                  {tempFilterUniversity && uniPickerExpanded ? (
                    <Pressable
                      onPress={() => {
                        setUniPickerExpanded(false);
                        setUniSearchQuery('');
                      }}
                      hitSlop={8}
                      style={styles.filterDoneRow}
                    >
                      <Text style={[styles.filterDoneLink, { color: theme.primary }]}>Done</Text>
                    </Pressable>
                  ) : null}
                  <View
                    style={[
                      styles.inputRow,
                      { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                    ]}
                  >
                    <Feather name="search" size={16} color={theme.textSecondary} />
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      placeholder="Search universities…"
                      placeholderTextColor={theme.textSecondary}
                      value={uniSearchQuery}
                      onChangeText={setUniSearchQuery}
                      autoCorrect={false}
                      autoCapitalize="none"
                    />
                    {uniSearchQuery ? (
                      <Pressable onPress={() => setUniSearchQuery('')} hitSlop={6}>
                        <Feather name="x-circle" size={16} color={theme.textSecondary} />
                      </Pressable>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.searchListWrap,
                      { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                    ]}
                  >
                    <Pressable
                      style={[styles.searchHitRow, { borderBottomColor: theme.border }]}
                      onPress={() => {
                        setTempFilterUniversity(null);
                        setTempFilterCampusId(null);
                        setUniSearchQuery('');
                        setUniPickerExpanded(true);
                      }}
                    >
                      <Text style={[styles.searchHitText, { color: theme.text }]}>Any university</Text>
                      {!tempFilterUniversity ? (
                        <Feather name="check" size={18} color={theme.primary} />
                      ) : null}
                    </Pressable>
                    <ScrollView
                      style={styles.searchListScroll}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
                      {filteredUniversitiesList.length === 0 ? (
                        <Text style={[styles.searchEmptyHint, { color: theme.textSecondary }]}>
                          No universities match your search.
                        </Text>
                      ) : (
                        filteredUniversitiesList.map((item) => {
                          const sel = tempFilterUniversity === item.id;
                          return (
                            <Pressable
                              key={item.id}
                              style={[styles.searchHitRow, { borderBottomColor: theme.border }]}
                              onPress={() => {
                                setTempFilterUniversity(item.id);
                                setTempFilterCampusId(null);
                                setUniSearchQuery('');
                                setUniPickerExpanded(false);
                              }}
                            >
                              <Text style={[styles.searchHitText, { color: theme.text }]} numberOfLines={2}>
                                {item.name}
                              </Text>
                              {sel ? <Feather name="check" size={18} color={theme.primary} /> : null}
                            </Pressable>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                </>
              )}

              {tempFilterUniversity ? (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CAMPUS</Text>
                  <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
                    Optional. Tap to search campuses for this university.
                  </Text>
                  {tempFilterCampusId && !campusPickerExpanded ? (
                    <View
                      style={[
                        styles.filterCollapsedRow,
                        { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                      ]}
                    >
                      <Feather name="map-pin" size={16} color={theme.primary} />
                      <Text style={[styles.filterCollapsedTitle, { color: theme.text }]} numberOfLines={2}>
                        {campuses.find((c) => c.id === tempFilterCampusId)?.name ?? 'Campus'}
                      </Text>
                      <Pressable onPress={() => setCampusPickerExpanded(true)} hitSlop={8}>
                        <Text style={[styles.filterChangeLink, { color: theme.primary }]}>Change</Text>
                      </Pressable>
                      <Pressable onPress={() => setTempFilterCampusId(null)} hitSlop={6}>
                        <Feather name="x-circle" size={18} color={theme.textSecondary} />
                      </Pressable>
                    </View>
                  ) : null}
                  {!tempFilterCampusId && !campusPickerExpanded ? (
                    <Pressable
                      style={[
                        styles.filterCompactTapRow,
                        { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                      ]}
                      onPress={() => setCampusPickerExpanded(true)}
                    >
                      <Feather name="map-pin" size={16} color={theme.textSecondary} />
                      <View style={styles.filterCompactTapTextCol}>
                        <Text style={[styles.filterCompactTapText, { color: theme.text }]}>Any campus</Text>
                        <Text style={[styles.filterCompactTapHint, { color: theme.textSecondary }]}>
                          Tap to search campuses
                        </Text>
                      </View>
                      <Feather name="chevron-down" size={18} color={theme.textSecondary} />
                    </Pressable>
                  ) : null}
                  {campusPickerExpanded ? (
                    <>
                      <Pressable
                        onPress={() => {
                          setCampusPickerExpanded(false);
                          setCampusSearchQuery('');
                        }}
                        hitSlop={8}
                        style={styles.filterDoneRow}
                      >
                        <Text style={[styles.filterDoneLink, { color: theme.primary }]}>Done</Text>
                      </Pressable>
                      <View
                        style={[
                          styles.inputRow,
                          { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                        ]}
                      >
                        <Feather name="search" size={16} color={theme.textSecondary} />
                        <TextInput
                          style={[styles.input, { color: theme.text }]}
                          placeholder="Search campuses…"
                          placeholderTextColor={theme.textSecondary}
                          value={campusSearchQuery}
                          onChangeText={setCampusSearchQuery}
                          autoCorrect={false}
                          autoCapitalize="none"
                        />
                        {campusSearchQuery ? (
                          <Pressable onPress={() => setCampusSearchQuery('')} hitSlop={6}>
                            <Feather name="x-circle" size={16} color={theme.textSecondary} />
                          </Pressable>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.searchListWrap,
                          { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                        ]}
                      >
                        <Pressable
                          style={[styles.searchHitRow, { borderBottomColor: theme.border }]}
                          onPress={() => {
                            setTempFilterCampusId(null);
                            setCampusSearchQuery('');
                            setCampusPickerExpanded(false);
                          }}
                        >
                          <Text style={[styles.searchHitText, { color: theme.text }]}>Any campus</Text>
                          {!tempFilterCampusId ? (
                            <Feather name="check" size={18} color={theme.primary} />
                          ) : null}
                        </Pressable>
                        <ScrollView
                          style={styles.searchListScroll}
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled"
                        >
                          {filteredCampusesList.length === 0 ? (
                            <Text style={[styles.searchEmptyHint, { color: theme.textSecondary }]}>
                              {campusSearchQuery.trim()
                                ? 'No campuses match your search.'
                                : 'No campuses loaded for this university.'}
                            </Text>
                          ) : (
                            filteredCampusesList.map((item) => {
                              const sel = tempFilterCampusId === item.id;
                              return (
                                <Pressable
                                  key={item.id}
                                  style={[styles.searchHitRow, { borderBottomColor: theme.border }]}
                                  onPress={() => {
                                    setTempFilterCampusId(item.id);
                                    setCampusSearchQuery('');
                                    setCampusPickerExpanded(false);
                                  }}
                                >
                                  <Text style={[styles.searchHitText, { color: theme.text }]} numberOfLines={2}>
                                    {item.name}
                                  </Text>
                                  {sel ? <Feather name="check" size={18} color={theme.primary} /> : null}
                                </Pressable>
                              );
                            })
                          )}
                        </ScrollView>
                      </View>
                    </>
                  ) : null}
                </>
              ) : null}

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CATEGORY</Text>
              <View style={styles.categoryChipWrap}>
                <Pressable
                  onPress={() => setTempCategory(null)}
                  style={[
                    styles.modalCategoryPill,
                    !tempCategory
                      ? { backgroundColor: theme.primary, borderColor: theme.primary }
                      : { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalCategoryPillText,
                      { color: !tempCategory ? theme.textInverse : theme.textSecondary },
                    ]}
                  >
                    All categories
                  </Text>
                </Pressable>
                {SERVICE_CATEGORIES.map((c) => {
                  const active = tempCategory === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setTempCategory(active ? null : c.id)}
                      style={[
                        styles.modalCategoryPill,
                        active
                          ? { backgroundColor: c.tint + '22', borderColor: c.tint }
                          : { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                      ]}
                    >
                      <Feather name={c.icon as any} size={13} color={active ? c.tint : theme.textSecondary} />
                      <Text
                        style={[styles.modalCategoryPillText, { color: active ? c.tint : theme.textSecondary }]}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Pressable
              style={({ pressed }) => [
                styles.applyBtn,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                setOrderBy(tempOrderBy);
                setKind(tempKind);
                setCategory(tempCategory);
                setFilterUniversity(tempFilterUniversity || null);
                setFilterCampusId(tempFilterCampusId || null);
                setUniSearchQuery('');
                setCampusSearchQuery('');
                setShowFilterModal(false);
              }}
            >
              <Text style={[styles.applyBtnText, { color: theme.textInverse }]}>Apply filters</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  // Header
  headerWrap: { paddingTop: 12, paddingBottom: 4 },
  headerInset: { paddingHorizontal: 16 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
  },

  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  scopeHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
  },
  filterIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconBtnDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  browseChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
    paddingBottom: 4,
  },
  browseActiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  browseActiveChipText: { fontSize: 12, fontWeight: '600', maxWidth: 200 },

  scopeBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
    gap: 2,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  scopeText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  scopeBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeBadgeText: { fontSize: 11, fontWeight: '700' },

  // List
  listContent: { paddingHorizontal: 16 },

  // Card
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  heroWrap: { width: '100%', height: 140, position: 'relative' },
  heroImg: { width: '100%', height: '100%' },
  heroTop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  kindChipPlain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kindChipText: { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusChipPlain: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusChipText: { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },

  cardBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  metaTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.4, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  
  cardUnreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
    marginTop: 2,
  },
  cardUnreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 200,
  },
  metaChipText: { fontSize: 11, fontWeight: '600', letterSpacing: -0.1 },

  hairline: { height: StyleSheet.hairlineWidth, marginTop: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingTop: 10 },
  authorName: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  authorMeta: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
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
  emptyCta: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
  },
  emptyCtaText: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  heroBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  filterSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  filterSheetHeaderSide: { minWidth: 72 },
  filterSheetTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  pickerOnlyHeader: {
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.2)',
    marginBottom: 4,
  },
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
  fieldHint: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: -4,
    marginBottom: 10,
    paddingLeft: 4,
  },
  searchListWrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 4,
  },
  searchListScroll: { maxHeight: 220 },
  searchHitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchHitText: { flex: 1, fontSize: 15, fontWeight: '500' },
  searchEmptyHint: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  filterCollapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  filterCollapsedTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 0,
  },
  filterChangeLink: { fontSize: 14, fontWeight: '700' },
  filterDoneRow: { alignSelf: 'flex-end', marginBottom: 6, paddingVertical: 4 },
  filterDoneLink: { fontSize: 14, fontWeight: '700' },
  filterCompactTapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  filterCompactTapTextCol: { flex: 1, minWidth: 0 },
  filterCompactTapText: { fontSize: 15, fontWeight: '600' },
  filterCompactTapHint: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  filterOptionLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  categoryChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  modalCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalCategoryPillText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  applyBtn: {
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(150,150,150,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sheetItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  
  // Intro Modal
  introOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  introModal: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  introIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  introDesc: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  introList: {
    width: '100%',
    gap: 16,
    marginBottom: 28,
  },
  introListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  introListTextWrap: {
    flex: 1,
  },
  introListTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  introListDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  introBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  introBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
