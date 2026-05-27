import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { Avatar } from '@/components/Avatar';
import * as servicesApi from '@/src/lib/servicesApi';
import { SURVEY_RECIPROCITY_MIN, type ServicePost } from '@/src/lib/servicesApi';

const SURVEY_TINT = '#FF6B6B';

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type ScopeFilter = 'all' | 'mine' | 'responded';

export default function FypSurveyBrowseScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useApp();

  const [surveys, setSurveys] = useState<ServicePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await servicesApi.fetchSurveys({ scope, search: search.trim() || null });
      setSurveys(data);
    } catch (e) {
      console.error('[FypSurveyBrowse] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [scope, search]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const SCOPE_TABS: { id: ScopeFilter; label: string }[] = [
    { id: 'all',       label: 'Open Surveys' },
    { id: 'mine',      label: 'My Surveys'   },
    { id: 'responded', label: 'Responded'    },
  ];

  const onPost = () => {
    router.push('/services/new?category=fyp_survey' as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Nav */}
      <View style={[styles.nav, { paddingTop: Math.max(insets.top, 16) + 4, borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Feather name="chevron-left" size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.navTitle, { color: theme.text }]}>📋 FYP Surveys</Text>
          <Text style={[styles.navSub, { color: theme.textSecondary }]}>
            Help fellow students — respond to others first
          </Text>
        </View>
        <Pressable
          onPress={onPost}
          style={[styles.postBtn, { backgroundColor: SURVEY_TINT }]}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.postBtnText}>Post</Text>
        </Pressable>
      </View>

      {/* Fairness explainer banner */}
      <View style={[styles.banner, { backgroundColor: SURVEY_TINT + '14', borderColor: SURVEY_TINT + '35' }]}>
        <Feather name="info" size={14} color={SURVEY_TINT} style={{ marginTop: 1 }} />
        <Text style={[styles.bannerText, { color: theme.textSecondary }]}>
          Surveys are shown in fairness order — those with fewest responses appear first. You must respond to <Text style={{ fontWeight: '700', color: SURVEY_TINT }}>{SURVEY_RECIPROCITY_MIN} surveys</Text> before posting your own.
        </Text>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { borderBottomColor: theme.border }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="search" size={15} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search surveys…"
            placeholderTextColor={theme.textSecondary + '88'}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => load()}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Feather name="x" size={14} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Scope tabs */}
      <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
        {SCOPE_TABS.map((t) => {
          const active = scope === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setScope(t.id)}
              style={[
                styles.tab,
                active && [styles.tabActive, { borderBottomColor: SURVEY_TINT }],
              ]}
            >
              <Text style={[styles.tabText, { color: active ? SURVEY_TINT : theme.textSecondary }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={SURVEY_TINT} />
        </View>
      ) : surveys.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>📋</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {scope === 'mine' ? 'No surveys posted yet' : scope === 'responded' ? "You haven't responded yet" : 'No open surveys'}
          </Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            {scope === 'all' ? 'Be the first to post your FYP survey!' : 'Browse open surveys and help out a fellow student 💪'}
          </Text>
          {scope === 'all' && (
            <Pressable
              onPress={onPost}
              style={[styles.emptyBtn, { backgroundColor: SURVEY_TINT }]}
            >
              <Text style={styles.emptyBtnText}>Post My Survey</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={SURVEY_TINT} />
          }
        >
          {surveys.map((s, i) => {
            const responded    = !!s.user_has_responded;
            const count        = s.survey_respond_count ?? 0;
            const quota        = s.survey_quota ?? 30;
            const pct          = Math.min(100, Math.round((count / quota) * 100));
            const isOwn        = s.author_id === user?.id;
            const isCompleted  = s.service_status === 'completed';
            const queuePos     = s.queue_position ?? (i + 1);

            return (
              <Pressable
                key={s.id}
                onPress={() => router.push(`/services/${s.id}` as any)}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {/* Header row */}
                <View style={styles.cardHeader}>
                  <Avatar
                    avatarUrl={s.author_avatar ?? undefined}
                    name={s.author_name || 'Student'}
                    size={36}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.cardAuthor, { color: theme.text }]} numberOfLines={1}>
                      {s.author_name || 'Student'}
                    </Text>
                    {s.author_university && (
                      <Text style={[styles.cardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {s.author_university}
                      </Text>
                    )}
                  </View>

                  {/* Status badges */}
                  {responded && (
                    <View style={[styles.badge, { backgroundColor: '#30D15820', borderColor: '#30D15840' }]}>
                      <Feather name="check" size={11} color="#30D158" />
                      <Text style={[styles.badgeText, { color: '#30D158' }]}>Responded</Text>
                    </View>
                  )}
                  {isOwn && !responded && (
                    <View style={[styles.badge, { backgroundColor: SURVEY_TINT + '20', borderColor: SURVEY_TINT + '40' }]}>
                      <Text style={[styles.badgeText, { color: SURVEY_TINT }]}>My survey</Text>
                    </View>
                  )}
                  {isCompleted && (
                    <View style={[styles.badge, { backgroundColor: '#0A84FF20', borderColor: '#0A84FF40' }]}>
                      <Text style={[styles.badgeText, { color: '#0A84FF' }]}>Closed</Text>
                    </View>
                  )}
                  {!isOwn && !responded && !isCompleted && queuePos <= 3 && (
                    <View style={[styles.badge, { backgroundColor: '#FF9F0A20', borderColor: '#FF9F0A40' }]}>
                      <Text style={[styles.badgeText, { color: '#FF9F0A' }]}>⚡ Urgent</Text>
                    </View>
                  )}
                </View>

                {/* Title */}
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                  {s.title}
                </Text>

                {/* Topic */}
                {s.survey_topic ? (
                  <Text style={[styles.cardTopic, { color: theme.textSecondary }]} numberOfLines={2}>
                    {s.survey_topic}
                  </Text>
                ) : null}

                {/* Course chip */}
                {s.survey_course ? (
                  <View style={[styles.courseChip, { backgroundColor: theme.border + '60' }]}>
                    <Feather name="book" size={11} color={theme.textSecondary} />
                    <Text style={[styles.courseText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {s.survey_course}
                    </Text>
                  </View>
                ) : null}

                {/* Progress bar */}
                <View style={styles.progressSection}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                    <Text style={[styles.progressLabel, { color: theme.text }]}>
                      {count} / {quota} respondents
                    </Text>
                    <Text style={[styles.progressPct, { color: isCompleted ? '#30D158' : SURVEY_TINT }]}>
                      {pct}%
                    </Text>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                    <View style={[
                      styles.progressFill,
                      { width: `${pct}%`, backgroundColor: isCompleted ? '#30D158' : SURVEY_TINT }
                    ]} />
                  </View>
                </View>

                {/* Footer */}
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardTime, { color: theme.textSecondary }]}>
                    {timeAgo(s.created_at)}
                  </Text>
                  {!isOwn && !responded && !isCompleted && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Feather name="external-link" size={12} color={SURVEY_TINT} />
                      <Text style={[styles.ctaText, { color: SURVEY_TINT }]}>Respond →</Text>
                    </View>
                  )}
                  {!isOwn && !responded && !isCompleted && (
                    <View style={[styles.queueBadge, { backgroundColor: SURVEY_TINT + '14' }]}>
                      <Text style={[{ fontSize: 11, fontWeight: '700', color: SURVEY_TINT }]}>#{queuePos} in queue</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  navSub: { fontSize: 11, marginTop: 1 },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  postBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { fontSize: 12, lineHeight: 17, flex: 1 },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14 },

  tabRow: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11 },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontWeight: '600' },

  card: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardAuthor: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  cardMeta: { fontSize: 11, marginTop: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3, lineHeight: 21, marginBottom: 4 },
  cardTopic: { fontSize: 12, lineHeight: 17, marginBottom: 8 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },

  courseChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    alignSelf: 'flex-start', marginBottom: 10,
  },
  courseText: { fontSize: 11, fontWeight: '500' },

  progressSection: { marginTop: 4, marginBottom: 10 },
  progressLabel: { fontSize: 12, fontWeight: '600' },
  progressPct: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTime: { fontSize: 11, flex: 1 },
  ctaText: { fontSize: 12, fontWeight: '700' },
  queueBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },

  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyBtn: {
    marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
