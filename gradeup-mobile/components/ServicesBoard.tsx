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
} from 'react-native';
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
import { SERVICE_CATEGORIES, getCategory, formatPrice, statusMeta } from '@/src/lib/servicesApi';

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
  const [kind, setKind] = useState<ServiceKind | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [status] = useState<ServiceStatus | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [items, setItems] = useState<ServicePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Debounce the search query so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const data = await servicesApi.fetchServices({
        scope,
        kind,
        category,
        status,
        search: debouncedSearch || null,
      });
      // Hide cancelled in Browse unless explicitly filtered
      const filtered = scope === 'all' && !status
        ? data.filter((s) => s.service_status !== 'cancelled')
        : data;
      setItems(filtered);
    } catch (e) {
      console.error('[ServicesBoard] fetch error:', e);
    }
  }, [scope, kind, category, status, debouncedSearch]);

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
          setTakenCount(taken.filter((s) => s.service_status === 'claimed').length);
        })
        .catch(() => {});
    }, [userId])
  );

  // ─── Renderers ────────────────────────────────────────────────────────────
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
                <Text style={{ fontSize: 13 }}>{c.emoji}</Text>
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
              <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                {item.title}
              </Text>
            </View>

            {item.body ? (
              <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              <View style={[styles.metaChip, { backgroundColor: cat.tint + '14' }]}>
                <Text style={{ fontSize: 11 }}>{cat.emoji}</Text>
                <Text style={[styles.metaChipText, { color: cat.tint }]}>{cat.label}</Text>
              </View>

              <View style={[styles.metaChip, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="dollar-sign" size={10} color={theme.text} />
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
            onPress={() => router.push('/services/new' as any)}
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
        onPress={() => router.push('/services/new' as any)}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.primary, bottom: tabBarTotal + 16 },
          pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
        ]}
      >
        <Feather name="plus" size={22} color={theme.textInverse} />
      </Pressable>
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
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '700', letterSpacing: -0.3, lineHeight: 22 },
  cardSubtitle: { fontSize: 13, fontWeight: '400', lineHeight: 18, marginTop: 4 },

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
});
