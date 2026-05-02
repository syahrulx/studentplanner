import React, { useState, useCallback, useEffect } from 'react';
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
  Platform,
  ActionSheetIOS,
  Alert,
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

  // Location filter state
  const [filterUniversity, setFilterUniversity] = useState<string | null>(null);
  const [filterCampus, setFilterCampus] = useState<string | null>(null);
  const [universities, setUniversities] = useState<eventsApi.University[]>([]);
  const [campuses, setCampuses] = useState<eventsApi.Campus[]>([]);

  // Picker modal state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerData, setPickerData] = useState<{ id: string; name: string }[]>([]);
  const [pickerTitle, setPickerTitle] = useState('');
  const [pickerOnSelect, setPickerOnSelect] = useState<(id: string) => void>(() => () => {});

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

  const load = useCallback(async () => {
    try {
      const data = await servicesApi.fetchServices({
        scope,
        kind,
        category,
        status,
        search: debouncedSearch || null,
        orderBy,
        universityId: filterUniversity || undefined,
        campus: filterCampus || undefined,
      });
      // Hide cancelled in Browse unless explicitly filtered
      const filtered = scope === 'all' && !status
        ? data.filter((s) => s.service_status !== 'cancelled')
        : data;
      setItems(filtered);
    } catch (e) {
      console.error('[ServicesBoard] fetch error:', e);
    }
  }, [scope, kind, category, status, debouncedSearch, orderBy, filterUniversity, filterCampus]);

  // Refetches both on focus AND when filters/search change while focused
  // (useFocusEffect re-runs when its callback identity changes while in focus).
  // We only flip `loading` to true on the very first load to avoid flashing
  // the spinner every time the user changes a filter.
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

  useEffect(() => {
    eventsApi.fetchUniversities().then(setUniversities);
  }, []);

  useEffect(() => {
    if (filterUniversity) {
      eventsApi.fetchCampuses(filterUniversity).then(setCampuses);
    } else {
      setCampuses([]);
      setFilterCampus(null);
    }
  }, [filterUniversity]);

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

  // ─── Renderers ────────────────────────────────────────────────────────────

  const handleSortOptions = () => {
    const options = ['Cancel', 'Newest (Default)', 'Price: Low to High', 'Price: High to Low', 'Deadline: Ending Soonest'];
    const mapping: Record<number, 'newest' | 'price_asc' | 'price_desc' | 'deadline_asc'> = {
      1: 'newest',
      2: 'price_asc',
      3: 'price_desc',
      4: 'deadline_asc',
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          title: 'Sort Services',
        },
        (buttonIndex) => {
          if (buttonIndex !== 0) {
            setOrderBy(mapping[buttonIndex]);
          }
        }
      );
    } else {
      Alert.alert('Sort Services', 'Choose a sorting option:', [
        { text: 'Newest (Default)', onPress: () => setOrderBy('newest') },
        { text: 'Price: Low to High', onPress: () => setOrderBy('price_asc') },
        { text: 'Price: High to Low', onPress: () => setOrderBy('price_desc') },
        { text: 'Deadline: Ending Soonest', onPress: () => setOrderBy('deadline_asc') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleLocationOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Everywhere', 'Select University', 'Select Campus'],
          cancelButtonIndex: 0,
          title: 'Filter by Location',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            setFilterUniversity(null);
            setFilterCampus(null);
          } else if (buttonIndex === 2) {
            setPickerTitle('Select University');
            setPickerData([{ id: '', name: 'Everywhere' }, ...universities.map(u => ({ id: u.id, name: u.name.toUpperCase() }))]);
            setPickerOnSelect(() => (id: string) => {
              setFilterUniversity(id || null);
              setFilterCampus(null);
            });
            setPickerVisible(true);
          } else if (buttonIndex === 3) {
            if (!filterUniversity) {
               // Default to user's university if they try to select campus without picking a uni first
               if ((user as any)?.university_id || (user as any)?.universityId) {
                 const uid = (user as any)?.university_id || (user as any)?.universityId;
                 setFilterUniversity(uid);
                 eventsApi.fetchCampuses(uid).then(camps => {
                   setPickerTitle('Select Campus');
                   setPickerData([{ id: '', name: 'Any Campus' }, ...camps.map(c => ({ id: c.name, name: c.name }))]);
                   setPickerOnSelect(() => (id: string) => setFilterCampus(id || null));
                   setPickerVisible(true);
                 });
                 return;
               } else {
                 Alert.alert('Select University First', 'Please select a university before filtering by campus.');
                 return;
               }
            }
            setPickerTitle('Select Campus');
            setPickerData([{ id: '', name: 'Any Campus' }, ...campuses.map(c => ({ id: c.name, name: c.name }))]);
            setPickerOnSelect(() => (id: string) => setFilterCampus(id || null));
            setPickerVisible(true);
          }
        }
      );
    } else {
      Alert.alert('Location', 'Filter by:', [
        { text: 'Everywhere', onPress: () => { setFilterUniversity(null); setFilterCampus(null); } },
        { text: 'Select University', onPress: () => {
            setPickerTitle('Select University');
            setPickerData([{ id: '', name: 'Everywhere' }, ...universities.map(u => ({ id: u.id, name: u.name.toUpperCase() }))]);
            setPickerOnSelect(() => (id: string) => {
              setFilterUniversity(id || null);
              setFilterCampus(null);
            });
            setPickerVisible(true);
        }},
        { text: 'Select Campus', onPress: () => {
            if (!filterUniversity) return Alert.alert('Select University First', 'Please select a university before filtering by campus.');
            setPickerTitle('Select Campus');
            setPickerData([{ id: '', name: 'Any Campus' }, ...campuses.map(c => ({ id: c.name, name: c.name }))]);
            setPickerOnSelect(() => (id: string) => setFilterCampus(id || null));
            setPickerVisible(true);
        }},
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const renderPickerModal = () => (
    <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
      <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={e => e.stopPropagation()}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{pickerTitle}</Text>
          </View>
          <FlatList
            data={pickerData}
            keyExtractor={(item, index) => item.id || index.toString()}
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
    </Modal>
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

        {/* Scope tabs (Browse / My Requests / My Tasks) */}
        <View style={[styles.scopeBar, { backgroundColor: theme.backgroundSecondary }]}>
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
      </View>

      {/* Edge-to-edge horizontal filter rail (only on Browse) */}
      {scope === 'all' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
        >
          {/* Sort Button */}
          <Pressable
            onPress={handleSortOptions}
            style={[
              styles.pill,
              { backgroundColor: theme.card, borderColor: theme.border, marginRight: 4 },
              orderBy !== 'newest' && { borderColor: theme.primary, backgroundColor: theme.primary + '10' }
            ]}
          >
            <Feather name="bar-chart-2" size={14} color={orderBy !== 'newest' ? theme.primary : theme.textSecondary} style={{ transform: [{ rotate: '90deg' }] }} />
            <Text style={[styles.pillText, { color: orderBy !== 'newest' ? theme.primary : theme.textSecondary, marginLeft: 4 }]}>
              {orderBy === 'newest' ? 'Sort' : 
               orderBy === 'price_asc' ? 'Low to High' :
               orderBy === 'price_desc' ? 'High to Low' : 'Ending Soon'}
            </Text>
          </Pressable>

          {/* Location Button */}
          <Pressable
            onPress={handleLocationOptions}
            style={[
              styles.pill,
              { backgroundColor: theme.card, borderColor: theme.border, marginRight: 4 },
              (filterUniversity || filterCampus) && { borderColor: theme.primary, backgroundColor: theme.primary + '10' }
            ]}
          >
            <Feather name="map-pin" size={14} color={(filterUniversity || filterCampus) ? theme.primary : theme.textSecondary} />
            <Text style={[styles.pillText, { color: (filterUniversity || filterCampus) ? theme.primary : theme.textSecondary, marginLeft: 4 }]}>
              {filterCampus 
                ? filterCampus 
                : filterUniversity 
                  ? filterUniversity.toUpperCase() 
                  : 'Everywhere'}
            </Text>
          </Pressable>

          <View style={[styles.pillDivider, { backgroundColor: theme.border }]} />

          {KIND_FILTERS.map((k) => {
            const active = kind === k.id;
            return (
              <Pressable
                key={String(k.id)}
                onPress={() => setKind(k.id)}
                style={[
                  styles.pill,
                  active
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: active ? theme.textInverse : theme.textSecondary },
                  ]}
                >
                  {k.label}
                </Text>
              </Pressable>
            );
          })}

          {/* divider */}
          <View style={[styles.pillDivider, { backgroundColor: theme.border }]} />

          {/* Categories */}
          <Pressable
            onPress={() => setCategory(null)}
            style={[
              styles.pill,
              !category
                ? { backgroundColor: theme.primary, borderColor: theme.primary }
                : { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.pillText, { color: !category ? theme.textInverse : theme.textSecondary }]}>
              All categories
            </Text>
          </Pressable>
          {SERVICE_CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategory(active ? null : c.id)}
                style={[
                  styles.pill,
                  active
                    ? { backgroundColor: c.tint + '22', borderColor: c.tint }
                    : { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Feather name={c.icon as any} size={13} color={active ? c.tint : theme.textSecondary} />
                <Text
                  style={[
                    styles.pillText,
                    { color: active ? c.tint : theme.textSecondary },
                  ]}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
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

      {renderPickerModal()}

      {/* Student Verification Gate */}
      <StudentVerificationModal
        visible={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerified={() => {
          setShowVerificationModal(false);
          router.push('/services/new' as any);
        }}
      />
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

  scopeBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
    marginBottom: 12,
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

  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  pillDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    marginHorizontal: 4,
  },

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
    maxHeight: '80%',
  },
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
