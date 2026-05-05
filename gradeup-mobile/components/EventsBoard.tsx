import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  Share,
  Alert,
  TouchableWithoutFeedback,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import Feather from '@expo/vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';

import { useDarkMinimalThemePack, useTheme, useThemePack } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';
import * as communityApi from '@/src/lib/communityApi';
import type { CommunityPost, PostType } from '@/src/lib/eventsApi';
import { Avatar } from '@/components/Avatar';
import { CatLottie } from '@/components/CatLottie';
import { SpiderLottie } from '@/components/SpiderLottie';

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_PILLS: { label: string; value: PostType | null; icon: string }[] = [
  { label: 'All', value: null, icon: 'grid' },
  { label: 'Events', value: 'event', icon: 'calendar' },
  { label: 'Memos', value: 'memo', icon: 'file-text' },
];

const TYPE_META: Record<PostType | 'other', { label: string; icon: string; tint: string }> = {
  event: { label: 'Event', icon: 'calendar', tint: '#0A84FF' },
  service: { label: 'Service', icon: 'tool', tint: '#FF9F0A' },
  memo: { label: 'Memo', icon: 'file-text', tint: '#BF5AF2' },
  other: { label: 'Other', icon: 'grid', tint: '#8E8E93' },
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EVENTS_REFRESH_MIN_MS = 1200;

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

// ─── Image Carousel Component ────────────────────────────────────────────────

function ImageCarousel({ images }: { images: string[] }) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = React.useState(0);

  if (images.length === 1) {
    return (
      <Image
        source={{ uri: images[0] }}
        style={{ width, aspectRatio: 1, backgroundColor: '#111' }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setActiveIndex(idx);
        }}
        scrollEventThrottle={32}
      >
        {images.map((uri, i) => (
          <Image
            key={i}
            source={{ uri }}
            style={{ width, aspectRatio: 1, backgroundColor: '#111' }}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      {/* Dot indicators */}
      <View style={carouselStyles.dots}>
        {images.map((_, i) => (
          <View
            key={i}
            style={[
              carouselStyles.dot,
              i === activeIndex ? carouselStyles.dotActive : carouselStyles.dotInactive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const carouselStyles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  dot: {
    borderRadius: 4,
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0A84FF',
  },
  dotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(150,150,150,0.4)',
  },
});

// ─── Component ──────────────────────────────────────────────────────────────

export default function EventsBoard() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  // CARD_WIDTH removed — now using full-width single-column Instagram layout
  const themePack = useThemePack();
  const isCatTheme = themePack === 'cat';
  const isDarkMinimal = useDarkMinimalThemePack();
  const isSpiderTheme = themePack === 'spider';
  const { user } = useApp();
  const dark = isDarkTheme(theme.id);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<PostType | null>(null);
  const [authorityStatus, setAuthorityStatus] = useState<string | null>(null);
  const [showIntroModal, setShowIntroModal] = useState(false);
  // Like state
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    async function checkIntro() {
      try {
        const seen = await AsyncStorage.getItem('has_seen_events_intro');
        if (!seen) {
          setShowIntroModal(true);
          await AsyncStorage.setItem('has_seen_events_intro', '1');
        }
      } catch (e) {}
    }
    checkIntro();
  }, []);

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

  const [uniSearchQuery, setUniSearchQuery] = useState('');
  const [campusSearchQuery, setCampusSearchQuery] = useState('');
  /** When false and a university is selected, search + list are hidden so other filters stay visible. */
  const [uniPickerExpanded, setUniPickerExpanded] = useState(true);
  /** When false, campus search + list are hidden after a campus is chosen (or compact "Any campus" row). */
  const [campusPickerExpanded, setCampusPickerExpanded] = useState(false);

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

  useEffect(() => {
    setCampusSearchQuery('');
    setCampusPickerExpanded(false);
  }, [tempUni]);

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
      // Fetch like status for all posts
      if (data.length) {
        const ids = data.map((p) => p.id);
        const liked = await eventsApi.getMyLikes(ids);
        setLikedPostIds(liked);
        const counts = new Map(data.map((p) => [p.id, p.like_count ?? 0]));
        setLikeCounts(counts);
      }
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
    const startedAt = Date.now();
    setRefreshing(true);
    try {
      await loadPosts();
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < EVENTS_REFRESH_MIN_MS) {
        await new Promise((resolve) => setTimeout(resolve, EVENTS_REFRESH_MIN_MS - elapsed));
      }
      setRefreshing(false);
    }
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
              setUniSearchQuery('');
              setCampusSearchQuery('');
              const nextUni = filterUniversity !== null ? filterUniversity : userUni || null;
              setTempUni(nextUni);
              setTempCampusId(filterCampusId);
              setTempOrgId(filterOrgId);
              setTempDate(filterDate);
              setUniPickerExpanded(!nextUni);
              setCampusPickerExpanded(false);
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

  // ─── Instagram-style Post Card ─────────────────────────────────────────────
  const renderCard = useCallback(
    ({ item }: { item: CommunityPost }) => {
      const meta = TYPE_META[item.post_type as keyof typeof TYPE_META] || TYPE_META.other;
      const eventDate = parseEventDate(item.event_date);
      const isOwn = user?.id === item.author_id;
      const orgName = item.organization_id
        ? organizations.find((o) => o.id === item.organization_id)?.name || null
        : null;
      const uniLabel = item.university_id ? item.university_id.toUpperCase() : 'Community';
      const images = item.image_urls?.length ? item.image_urls : item.image_url ? [item.image_url] : [];
      const isLiked = likedPostIds.has(item.id);
      const likeCount = likeCounts.get(item.id) ?? item.like_count ?? 0;

      const handleLike = () => {
        const willLike = !isLiked;
        setLikedPostIds((prev) => {
          const next = new Set(prev);
          willLike ? next.add(item.id) : next.delete(item.id);
          return next;
        });
        setLikeCounts((prev) => {
          const next = new Map(prev);
          next.set(item.id, Math.max(0, (prev.get(item.id) ?? 0) + (willLike ? 1 : -1)));
          return next;
        });
        if (willLike) {
          eventsApi.likePost(item.id).catch(() => {});
        } else {
          eventsApi.unlikePost(item.id).catch(() => {});
        }
      };

      const handleShare = async () => {
        const url = eventsApi.generateEventShareLink(item.id);
        const dateStr = eventDate ? ` · ${eventDate.weekday}, ${eventDate.monthLong} ${eventDate.day}` : '';
        const locationStr = item.location ? ` · ${item.location}` : '';
        try {
          await Share.share({
            message: `${item.title}${dateStr}${locationStr}\n${url}`,
            title: item.title,
          });
        } catch (_) {}
      };

      const handleReport = () => {
        Alert.alert(
          'Report or Block',
          'What would you like to do?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Report: Inappropriate',
              onPress: () => { eventsApi.reportPost(item.id, 'inappropriate').catch(() => {}); Alert.alert('Reported', 'Thank you. Our team will review this post.'); },
            },
            {
              text: 'Report: Spam',
              onPress: () => { eventsApi.reportPost(item.id, 'spam').catch(() => {}); Alert.alert('Reported', 'Thank you for your feedback.'); },
            },
            {
              text: 'Report: Misleading',
              onPress: () => { eventsApi.reportPost(item.id, 'misleading').catch(() => {}); Alert.alert('Reported', 'Thank you for your feedback.'); },
            },
            {
              text: 'Block User',
              style: 'destructive',
              onPress: () => {
                if (!user?.id || !item.author_id) return;
                communityApi.blockUserByUserId(user.id, item.author_id).catch(() => {});
                Alert.alert('User Blocked', 'You will no longer see posts from this user.');
              },
            },
          ]
        );
      };

      return (
        <View style={[styles.igCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* ── Author header ── */}
          <View style={styles.igHeader}>
            <View style={styles.igAvatarWrap}>
              {item.author_avatar ? (
                <Image source={{ uri: item.author_avatar }} style={styles.igAvatar} />
              ) : (
                <View style={[styles.igAvatar, styles.igAvatarFallback, { backgroundColor: meta.tint + '30' }]}>
                  <Text style={[styles.igAvatarInitial, { color: meta.tint }]}>
                    {(item.author_name || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.igAuthorName, { color: theme.text }]} numberOfLines={1}>
                {item.author_name || 'Author'}
              </Text>
              <Text style={[styles.igAuthorSub, { color: theme.textSecondary }]} numberOfLines={1}>
                {orgName || uniLabel} · {timeAgo(item.created_at)}
              </Text>
            </View>
            {/* Type badge */}
            <View style={[styles.igTypeBadge, { backgroundColor: meta.tint + '18' }]}>
              <Feather name={meta.icon as any} size={12} color={meta.tint} />
              <Text style={[styles.igTypeBadgeText, { color: meta.tint }]}>{meta.label}</Text>
            </View>
            {/* 3-dot menu */}
            <Pressable
              onPress={() =>
                isOwn
                  ? router.push({ pathname: '/community/create-post', params: { editId: item.id } } as any)
                  : handleReport()
              }
              hitSlop={8}
              style={styles.igMenuBtn}
            >
              <Feather name={isOwn ? 'edit-2' : 'more-horizontal'} size={18} color={theme.textSecondary} />
            </Pressable>
          </View>

          {/* ── Image carousel ── */}
          {images.length > 0 ? (
            <ImageCarousel images={images} />
          ) : (
            // No-image placeholder
            <View style={[styles.igNoImagePlaceholder, { backgroundColor: meta.tint + '10' }]}>
              <Feather name={meta.icon as any} size={36} color={meta.tint + '60'} />
            </View>
          )}

          {/* ── Action bar ── */}
          <View style={styles.igActions}>
            <Pressable onPress={handleLike} style={styles.igActionBtn}>
              <Feather
                name={isLiked ? 'heart' : 'heart'}
                size={24}
                color={isLiked ? '#FF3B30' : theme.textSecondary}
                style={isLiked ? { opacity: 1 } : { opacity: 0.65 }}
              />
            </Pressable>
            <Pressable onPress={handleShare} style={styles.igActionBtn}>
              <Feather name="send" size={22} color={theme.textSecondary} style={{ opacity: 0.65 }} />
            </Pressable>
            {/* Event date badge pushed to right */}
            {eventDate && (
              <View style={[styles.igDateBadge, { backgroundColor: meta.tint + '15', borderColor: meta.tint + '30' }]}>
                <Feather name="calendar" size={11} color={meta.tint} />
                <Text style={[styles.igDateBadgeText, { color: meta.tint }]}>{eventDate.full}</Text>
              </View>
            )}
          </View>

          {/* ── Like count ── */}
          {likeCount > 0 && (
            <Text style={[styles.igLikeCount, { color: theme.text }]}>
              {likeCount.toLocaleString()} {likeCount === 1 ? 'like' : 'likes'}
            </Text>
          )}

          {/* ── Caption ── */}
          <Pressable
            style={styles.igCaption}
            onPress={() => router.push({ pathname: '/community/post-detail', params: { postId: item.id } } as any)}
          >
            <Text style={[styles.igCaptionTitle, { color: theme.text }]} numberOfLines={2}>
              {item.pinned && <Text style={{ color: meta.tint }}>📌 </Text>}{item.title}
            </Text>
            {item.body ? (
              <Text style={[styles.igCaptionBody, { color: theme.textSecondary }]} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
            {item.location ? (
              <View style={styles.igLocationRow}>
                <Feather name="map-pin" size={11} color={theme.textSecondary} />
                <Text style={[styles.igLocationText, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.location}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      );
    },
    [theme, user, organizations, likedPostIds, likeCounts]
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
            {isCatTheme || isDarkMinimal ? (
              isSpiderTheme ? (
                <SpiderLottie variant="loading" style={styles.spiderLoadingLottie} />
              ) : (
                <CatLottie
                  variant={isCatTheme ? 'loading' : 'monoLoading'}
                  style={!isCatTheme && isDarkMinimal ? styles.monoLoadingLottie : styles.catLoadingLottie}
                />
              )
            ) : (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            )}
          </View>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          style={{ backgroundColor: theme.background }}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={Header}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical
          overScrollMode="always"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor={Platform.OS === 'android' ? 'transparent' : undefined}
            />
          }
          ListEmptyComponent={Empty}
        />
      )}
      {refreshing && (
        <View pointerEvents="none" style={styles.refreshOverlay}>
          {isCatTheme || isDarkMinimal ? (
            isSpiderTheme ? (
              <SpiderLottie variant="loading" style={styles.spiderRefreshLottie} />
            ) : (
              <CatLottie
                variant={isCatTheme ? 'loading' : 'monoLoading'}
                style={!isCatTheme && isDarkMinimal ? styles.monoRefreshLottie : styles.catRefreshLottie}
              />
            )
          ) : (
            <ActivityIndicator size="small" color={theme.primary} />
          )}
        </View>
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
                  setUniSearchQuery('');
                  setCampusSearchQuery('');
                  setUniPickerExpanded(true);
                  setCampusPickerExpanded(false);
                }}
                hitSlop={10}
              >
                <Text
                  style={[
                    styles.sheetReset,
                    {
                      color: theme.primary,
                      opacity:
                        tempUni || tempCampusId || tempOrgId || tempDate || uniSearchQuery || campusSearchQuery
                          ? 1
                          : 0.3,
                    },
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
              <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
                Defaults to your university; type to search or pick from the list.
              </Text>
              {tempUni && !uniPickerExpanded ? (
                <View
                  style={[
                    styles.filterCollapsedRow,
                    { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                  ]}
                >
                  <Feather name="award" size={16} color={theme.primary} />
                  <Text style={[styles.filterCollapsedTitle, { color: theme.text }]} numberOfLines={2}>
                    {universities.find((u) => u.id === tempUni)?.name || tempUni.toUpperCase()}
                  </Text>
                  <Pressable onPress={() => setUniPickerExpanded(true)} hitSlop={8}>
                    <Text style={[styles.filterChangeLink, { color: theme.primary }]}>Change</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setTempUni(null);
                      setTempCampusId(null);
                      setTempOrgId(null);
                      setUniPickerExpanded(true);
                    }}
                    hitSlop={6}
                  >
                    <Feather name="x-circle" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
              ) : null}
              {(!tempUni || uniPickerExpanded) && (
                <>
                  {tempUni && uniPickerExpanded ? (
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
                        setTempUni(null);
                        setTempCampusId(null);
                        setTempOrgId(null);
                        setUniSearchQuery('');
                        setUniPickerExpanded(true);
                      }}
                    >
                      <Text style={[styles.searchHitText, { color: theme.text }]}>Any university</Text>
                      {!tempUni ? (
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
                          const sel = tempUni === item.id;
                          return (
                            <Pressable
                              key={item.id}
                              style={[styles.searchHitRow, { borderBottomColor: theme.border }]}
                              onPress={() => {
                                setTempUni(item.id);
                                setTempCampusId(null);
                                setTempOrgId(null);
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

              {tempUni && (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CAMPUS</Text>
                  <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
                    Optional. Tap to search campuses for this university.
                  </Text>
                  {tempCampusId && !campusPickerExpanded ? (
                    <View
                      style={[
                        styles.filterCollapsedRow,
                        { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                      ]}
                    >
                      <Feather name="map-pin" size={16} color={theme.primary} />
                      <Text style={[styles.filterCollapsedTitle, { color: theme.text }]} numberOfLines={2}>
                        {campuses.find((c) => c.id === tempCampusId)?.name ?? 'Campus'}
                      </Text>
                      <Pressable onPress={() => setCampusPickerExpanded(true)} hitSlop={8}>
                        <Text style={[styles.filterChangeLink, { color: theme.primary }]}>Change</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setTempCampusId(null);
                          setTempOrgId(null);
                        }}
                        hitSlop={6}
                      >
                        <Feather name="x-circle" size={18} color={theme.textSecondary} />
                      </Pressable>
                    </View>
                  ) : null}
                  {!tempCampusId && !campusPickerExpanded ? (
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
                  {campusPickerExpanded && (
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
                            setTempCampusId(null);
                            setTempOrgId(null);
                            setCampusSearchQuery('');
                            setCampusPickerExpanded(false);
                          }}
                        >
                          <Text style={[styles.searchHitText, { color: theme.text }]}>Any campus</Text>
                          {!tempCampusId ? (
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
                              const sel = tempCampusId === item.id;
                              return (
                                <Pressable
                                  key={item.id}
                                  style={[styles.searchHitRow, { borderBottomColor: theme.border }]}
                                  onPress={() => {
                                    setTempCampusId(item.id);
                                    setTempOrgId(null);
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
                  )}

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
                setUniSearchQuery('');
                setCampusSearchQuery('');
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
              <Feather name="calendar" size={32} color={theme.primary} />
            </View>
            <Text style={[styles.introTitle, { color: theme.text }]}>Welcome to Events!</Text>
            <Text style={[styles.introDesc, { color: theme.textSecondary }]}>
              Discover what's happening around your campus and get involved.
            </Text>
            
            <View style={styles.introList}>
              <View style={styles.introListItem}>
                <Feather name="map-pin" size={18} color={theme.primary} style={{ marginTop: 2 }} />
                <View style={styles.introListTextWrap}>
                  <Text style={[styles.introListTitle, { color: theme.text }]}>Local Campus Events</Text>
                  <Text style={[styles.introListDesc, { color: theme.textSecondary }]}>Find activities, seminars, and club gatherings specific to your university.</Text>
                </View>
              </View>
              <View style={styles.introListItem}>
                <Feather name="file-text" size={18} color={theme.primary} style={{ marginTop: 2 }} />
                <View style={styles.introListTextWrap}>
                  <Text style={[styles.introListTitle, { color: theme.text }]}>Important Memos</Text>
                  <Text style={[styles.introListDesc, { color: theme.textSecondary }]}>Stay updated with official announcements and memos from student organizations.</Text>
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
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  refreshOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    zIndex: 40,
  },
  catLoadingLottie: {
    width: 84,
    height: 58,
  },
  monoLoadingLottie: {
    width: 122,
    height: 88,
  },
  spiderLoadingLottie: {
    width: 124,
    height: 94,
  },
  catRefreshLottie: {
    width: 74,
    height: 52,
  },
  monoRefreshLottie: {
    width: 106,
    height: 78,
  },
  spiderRefreshLottie: {
    width: 104,
    height: 78,
  },

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

  // Instagram-style card
  igCard: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 0,
  },
  igHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  igAvatarWrap: {},
  igAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  igAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  igAvatarInitial: {
    fontSize: 15,
    fontWeight: '800',
  },
  igAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  igAuthorSub: {
    fontSize: 12,
    marginTop: 1,
  },
  igTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 8,
  },
  igTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  igMenuBtn: {
    padding: 4,
  },
  igNoImagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  igActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 2,
    gap: 4,
  },
  igActionBtn: {
    padding: 6,
  },
  igDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto' as any,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  igDateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  igLikeCount: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginTop: 2,
  },
  igCaption: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
  },
  igCaptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  igCaptionBody: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  igLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  igLocationText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },

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
