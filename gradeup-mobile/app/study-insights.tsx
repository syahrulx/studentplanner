/**
 * Study insights — "Your progress".
 *
 * A passive read of `get_study_insights` plus two shortcuts back into the
 * normal quiz pipeline: practise one weak topic, or retry everything you have
 * missed. No gameplay lives here — both buttons stash generated questions and
 * hand off to `/quiz-mode-selection`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme, type ThemePalette } from '@/constants/Themes';
import { useTranslations } from '@/src/i18n';
import { setGeneratedQuizQuestions } from '@/src/lib/studyApi';
import {
  getStudyInsights,
  buildMissedQuestionsQuiz,
  EMPTY_INSIGHTS,
  type StudyInsights,
} from '@/src/lib/studyInsights';

/** Sentinel `sourceId` for the cross-note "retry everything I missed" quiz. */
const MISSED_SOURCE_ID = '_missed';

function createStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 56 : 40,
      paddingBottom: 12,
      gap: 12,
    },
    backWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1 },
    headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text, letterSpacing: -0.4 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    card: {
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: theme.text, letterSpacing: -0.2 },
    sectionSub: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginTop: 2 },
    emptyText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.textSecondary,
      lineHeight: 19,
      marginTop: 10,
    },
    tileRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    tile: {
      flex: 1,
      minWidth: 0,
      borderRadius: 14,
      backgroundColor: theme.backgroundSecondary,
      paddingVertical: 10,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    tileValue: { fontSize: 20, fontWeight: '900', color: theme.primary },
    tileLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 13,
    },
    weakRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 14,
    },
    weakMain: { flex: 1, minWidth: 0 },
    weakTitle: { fontSize: 15, fontWeight: '800', color: theme.text, lineHeight: 20 },
    weakSub: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginTop: 3 },
    barTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.backgroundSecondary,
      marginTop: 8,
      overflow: 'hidden',
    },
    barFill: { height: 6, borderRadius: 3 },
    ghostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      minWidth: 88,
      minHeight: 38,
    },
    ghostBtnText: { fontSize: 12, fontWeight: '800', color: theme.text },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      paddingVertical: 14,
      borderRadius: 14,
      marginTop: 12,
      minHeight: 50,
    },
    primaryBtnText: { fontSize: 14, fontWeight: '900', color: theme.textInverse, letterSpacing: 0.4 },
    disabled: { opacity: 0.55 },
    bodyText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, lineHeight: 19, marginTop: 8 },
  });
}

export default function StudyInsightsScreen() {
  const { language } = useApp();
  const theme = useTheme();
  const themeId = useThemeId();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const T = useTranslations(language);
  const insets = useSafeAreaInsets();

  const mountedRef = useRef(true);
  const [insights, setInsights] = useState<StudyInsights>(EMPTY_INSIGHTS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** `null` = idle. Otherwise the key of the button currently building a quiz. */
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const next = await getStudyInsights();
    if (!mountedRef.current) return;
    setInsights(next);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      if (mountedRef.current) setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mountedRef.current) setRefreshing(false);
  }, [load]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/notes' as any);
  }, []);

  /**
   * Both entry points are the same handoff: build from the missed bank, stash,
   * then push the standard mode-selection screen with `useGenerated=1`.
   */
  const startPractice = useCallback(
    async (key: string, options: { noteId?: string; limit: number; sourceId: string }) => {
      if (busyKey) return; // guards double-taps and cross-button taps
      setBusyKey(key);
      try {
        const { questions, sourceNoteIds } = await buildMissedQuestionsQuiz({
          limit: options.limit,
          ...(options.noteId ? { noteId: options.noteId } : {}),
        });
        if (!mountedRef.current) return;
        if (questions.length === 0) {
          Alert.alert(T('missedQuizEmpty'));
          return;
        }
        await setGeneratedQuizQuestions(questions, sourceNoteIds);
        if (!mountedRef.current) return;
        router.push({
          pathname: '/quiz-mode-selection',
          params: {
            useGenerated: '1',
            total: String(questions.length),
            quizType: 'mixed',
            difficulty: 'medium',
            timer: 'off',
            sourceType: 'notes',
            sourceId: options.sourceId,
          },
        } as any);
      } finally {
        if (mountedRef.current) setBusyKey(null);
      }
    },
    [busyKey, T],
  );

  const accuracyColor = useCallback(
    (pct: number) => (pct < 50 ? theme.danger : pct < 70 ? theme.warning : theme.success),
    [theme],
  );

  const { reviews, weakNotes, missedCount } = insights;
  const retentionLabel = reviews.retentionPct == null ? '—' : `${Math.round(reviews.retentionPct)}%`;

  return (
    <View style={styles.root}>
      <StatusBar style={isDarkTheme(themeId) ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable style={styles.backWrap} onPress={handleBack} hitSlop={6}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{T('insightsTitle')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void onRefresh();
              }}
              tintColor={theme.primary}
            />
          }
        >
          {/* 1 — Flashcard review stats */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{T('insightsReviewsTitle')}</Text>
            <Text style={styles.sectionSub}>{T('insightsLast30')}</Text>
            {reviews.total === 0 ? (
              <Text style={styles.emptyText}>{T('insightsNoReviews')}</Text>
            ) : (
              <View style={styles.tileRow}>
                <View style={styles.tile}>
                  <Text style={styles.tileValue}>{reviews.streak}</Text>
                  <Text style={styles.tileLabel}>{T('insightsStreak')}</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={styles.tileValue}>{retentionLabel}</Text>
                  <Text style={styles.tileLabel}>{T('insightsRetention')}</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={styles.tileValue}>{reviews.total}</Text>
                  <Text style={styles.tileLabel}>{T('insightsReviewed')}</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={styles.tileValue}>{reviews.daysActive}</Text>
                  <Text style={styles.tileLabel}>{T('insightsDaysActive')}</Text>
                </View>
              </View>
            )}
          </View>

          {/* 2 — Weak topics */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{T('insightsWeakTitle')}</Text>
            {weakNotes.length === 0 ? (
              <Text style={styles.emptyText}>{T('insightsWeakEmpty')}</Text>
            ) : (
              weakNotes.map((note) => {
                const pct = Math.max(0, Math.min(100, Math.round(note.accuracyPct)));
                const key = `weak:${note.noteId}`;
                const busy = busyKey === key;
                return (
                  <View key={note.noteId} style={styles.weakRow}>
                    <View style={styles.weakMain}>
                      <Text style={styles.weakTitle} numberOfLines={2}>
                        {note.title}
                      </Text>
                      <Text style={styles.weakSub}>
                        {T('insightsWeakRow')
                          .replace('{p}', String(pct))
                          .replace('{n}', String(note.attempts))}
                      </Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${pct}%`, backgroundColor: accuracyColor(pct) },
                          ]}
                        />
                      </View>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.ghostBtn,
                        (busyKey !== null || pressed) && styles.disabled,
                      ]}
                      disabled={busyKey !== null}
                      onPress={() => {
                        void startPractice(key, {
                          noteId: note.noteId,
                          limit: 10,
                          sourceId: note.noteId,
                        });
                      }}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={theme.text} />
                      ) : (
                        <>
                          <Feather name="play" size={13} color={theme.text} />
                          <Text style={styles.ghostBtnText}>{T('insightsWeakPractice')}</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>

          {/* 3 — Missed questions */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{T('insightsMissedTitle')}</Text>
            {missedCount === 0 ? (
              <Text style={styles.emptyText}>{T('insightsMissedEmpty')}</Text>
            ) : (
              <>
                <Text style={styles.bodyText}>
                  {T('insightsMissedBody').replace('{n}', String(missedCount))}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    (busyKey !== null || pressed) && styles.disabled,
                  ]}
                  disabled={busyKey !== null}
                  onPress={() => {
                    void startPractice('missed', { limit: 15, sourceId: MISSED_SOURCE_ID });
                  }}
                >
                  {busyKey === 'missed' ? (
                    <>
                      <ActivityIndicator size="small" color={theme.textInverse} />
                      <Text style={styles.primaryBtnText}>{T('missedQuizBuilding')}</Text>
                    </>
                  ) : (
                    <>
                      <Feather name="refresh-cw" size={16} color={theme.textInverse} />
                      <Text style={styles.primaryBtnText}>{T('insightsMissedCta')}</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
