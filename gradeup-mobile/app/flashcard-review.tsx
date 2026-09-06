import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ScrollView, Dimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useDarkMinimalThemePack, useTheme } from '@/hooks/useTheme';
import { Icons } from '@/src/constants';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import type { ThemePalette } from '@/constants/Themes';
import type { Flashcard } from '@/src/types';
import {
  cardFaces,
  dueCounts,
  formatInterval,
  isDue,
  nextDueDate,
  previewIntervals,
  type FlashcardRating,
} from '@/src/lib/fsrs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

type ReviewMode = 'deck' | 'due';

/**
 * Card height floor, as a share of the screen.
 *
 * Cards are short (a question and a hint), so on a tall phone they shrank to a
 * small block adrift in empty space. Scaling to the viewport keeps a consistent
 * shape across devices, and keeps the front and back the same size so the card
 * does not resize when it flips.
 */
const CARD_MIN_HEIGHT = Math.max(240, Math.round(Dimensions.get('window').height * 0.3));

function createStyles(theme: ThemePalette, isDarkMinimal: boolean) {
  const monoAccent = '#9ca3af';
  const primaryCta = isDarkMinimal ? monoAccent : '#fbbf24';
  const primaryCtaText = isDarkMinimal ? '#111827' : '#0f172a';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 24 },
    backIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      marginRight: 12,
    },
    headerText: { flex: 1 },
    title: { fontSize: 20, fontWeight: '800', color: theme.text, letterSpacing: -0.3 },
    subtitle: { fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, marginTop: 4 },
    progressSection: { paddingHorizontal: 24 },
    progressMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    progressMetaLeft: { fontSize: 11, fontWeight: '800', color: theme.textSecondary, letterSpacing: 1.2 },
    progressMetaRight: { fontSize: 11, fontWeight: '800', color: theme.textSecondary, letterSpacing: 1.2, textAlign: 'right', opacity: 0.6 },
    progressBarBg: { height: 4, borderRadius: 2, backgroundColor: theme.border, marginBottom: 20 },
    progressBarFill: { height: '100%', borderRadius: 2, backgroundColor: isDarkMinimal ? monoAccent : '#facc15' },
    cardArea: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    cardWrap: {
      width: '100%',
      maxWidth: 400,
    },
    // FRONT card
    cardFront: {
      borderRadius: 28,
      backgroundColor: theme.card,
      paddingVertical: 36,
      paddingHorizontal: 28,
      // Front and back share a floor so the card fills more of a tall screen
      // and does not jump in size when it flips.
      minHeight: CARD_MIN_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: `${theme.primary}20`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    cardQuestion: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.text,
      textAlign: 'center',
      marginBottom: 12,
    },
    cardHint: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      textAlign: 'center',
      fontStyle: 'italic',
      marginBottom: 6,
    },
    cardTypeBadge: {
      alignSelf: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: `${theme.primary}14`,
      marginBottom: 12,
    },
    cardTypeBadgeText: { fontSize: 10, fontWeight: '800', color: theme.primary, letterSpacing: 1.2 },
    tapHint: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      letterSpacing: 1.4,
      marginTop: 8,
      textTransform: 'uppercase',
      opacity: 0.5,
    },
    // BACK card
    cardBack: {
      borderRadius: 28,
      backgroundColor: isDarkMinimal ? '#f5f5f5' : theme.primary,
      paddingVertical: 32,
      paddingHorizontal: 24,
      minHeight: CARD_MIN_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 6,
    },
    cardAnswer: {
      fontSize: 19,
      fontWeight: '700',
      color: isDarkMinimal ? '#000000' : '#ffffff',
      textAlign: 'center',
      lineHeight: 26,
      marginBottom: 20,
    },
    ratingRow: {
      flexDirection: 'row',
      gap: 8,
      width: '100%',
    },
    ratingBtn: {
      flex: 1,
      // Single-line labels now, so pad more to keep a comfortable tap target.
      paddingVertical: 16,
      paddingHorizontal: 6,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDarkMinimal ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)',
    },
    ratingBtnGood: { backgroundColor: primaryCta },
    ratingLabel: {
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'center',
      color: isDarkMinimal ? '#000000' : '#ffffff',
    },
    ratingLabelGood: { color: primaryCtaText },
    footerHint: {
      marginTop: 12,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      letterSpacing: 1.4,
      opacity: 0.5,
      paddingHorizontal: 24,
    },
    emptyWrap: { flex: 1, paddingHorizontal: 28, paddingTop: 32, justifyContent: 'center' },
    empty: { fontSize: 16, color: theme.textSecondary, textAlign: 'center', lineHeight: 24 },
    emptyActions: { marginTop: 28, gap: 12 },
    emptyPrimaryBtn: {
      paddingVertical: 14,
      paddingHorizontal: 22,
      backgroundColor: theme.primary,
      borderRadius: 14,
      alignItems: 'center',
    },
    emptyPrimaryBtnText: { color: isDarkMinimal ? '#000000' : '#fff', fontWeight: '800', fontSize: 16 },
    emptySecondaryBtn: {
      paddingVertical: 14,
      paddingHorizontal: 22,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      backgroundColor: theme.card,
    },
    emptySecondaryBtnText: { color: theme.text, fontWeight: '700', fontSize: 15 },
    // Summary
    summaryScroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 },
    summaryCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      alignItems: 'center',
    },
    summaryTitle: { fontSize: 22, fontWeight: '800', color: theme.text, marginTop: 12, textAlign: 'center' },
    summarySub: { fontSize: 13, color: theme.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 19 },
    statsRow: { flexDirection: 'row', gap: 10, marginTop: 22, width: '100%' },
    statBox: {
      flex: 1,
      borderRadius: 16,
      backgroundColor: theme.backgroundSecondary,
      paddingVertical: 14,
      alignItems: 'center',
    },
    statValue: { fontSize: 22, fontWeight: '900', color: theme.text },
    statLabel: { fontSize: 10, fontWeight: '800', color: theme.textSecondary, letterSpacing: 1, marginTop: 4, textTransform: 'uppercase' },
    summaryActions: { marginTop: 22, gap: 12, width: '100%' },
    errorBanner: {
      marginHorizontal: 24,
      marginBottom: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: `${theme.danger}18`,
    },
    errorBannerText: { fontSize: 12, fontWeight: '700', color: theme.danger, textAlign: 'center' },
  });
}

/**
 * Three ratings, not the full FSRS four.
 *
 * "Hard" (2) is dropped on purpose: for a student audience it overlaps too
 * closely with "Again" — both read as "I struggled" — and a rating picked at
 * random is worse for the schedule than a coarser one picked honestly. FSRS
 * schedules fine on a subset of ratings. "Too easy" is kept because it is
 * clearly distinguishable and stops well-known cards coming back too often.
 */
const RATINGS: FlashcardRating[] = [1, 3, 4];

export default function FlashcardReview() {
  const params = useLocalSearchParams<{ noteId?: string; mode?: string }>();
  const noteId = typeof params.noteId === 'string' && params.noteId.length > 0 ? params.noteId : undefined;
  const mode: ReviewMode = params.mode === 'due' ? 'due' : 'deck';
  const { flashcards, notes, user, language, reviewFlashcard } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();
  const isDarkMinimal = useDarkMinimalThemePack();
  const styles = useMemo(() => createStyles(theme, isDarkMinimal), [theme, isDarkMinimal]);

  // Snapshot the session queue ONCE per (mode, noteId) so that context updates
  // caused by our own reviews (or background syncs) never reshuffle or reset
  // the cards mid-session.
  const buildQueue = useCallback((): Flashcard[] => {
    const now = new Date();
    const scoped = noteId ? flashcards.filter((c) => c.noteId === noteId) : flashcards;
    if (mode === 'due') {
      return scoped
        .filter((c) => isDue(c, now))
        .sort((a, b) => new Date(a.due ?? 0).getTime() - new Date(b.due ?? 0).getTime());
    }
    return scoped;
  }, [flashcards, noteId, mode]);

  const [queue, setQueue] = useState<Flashcard[]>(() => buildQueue());
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [againIds, setAgainIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sessionKeyRef = useRef(`${mode}:${noteId ?? ''}`);
  const cardStartRef = useRef<number>(Date.now());
  const ratingBusyRef = useRef(false);

  const resetSession = useCallback((cards: Flashcard[]) => {
    setQueue(cards);
    setIndex(0);
    setShowBack(false);
    setShuffled(false);
    setFinished(false);
    setReviewedCount(0);
    setAgainIds([]);
    setSaveError(null);
    cardStartRef.current = Date.now();
  }, []);

  // Only rebuild when the params change (deep-link to a different deck/mode).
  useEffect(() => {
    const key = `${mode}:${noteId ?? ''}`;
    if (sessionKeyRef.current === key) return;
    sessionKeyRef.current = key;
    resetSession(buildQueue());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, noteId]);

  // Keep the freshest FSRS state for the card being shown (previews use it),
  // while the queue membership/order itself stays frozen.
  const latestById = useMemo(() => {
    const m = new Map<string, Flashcard>();
    for (const c of flashcards) m.set(c.id, c);
    return m;
  }, [flashcards]);

  const list = queue;
  const queued = list[index];
  const card = queued ? latestById.get(queued.id) ?? queued : undefined;

  const toggleShuffle = useCallback(() => {
    setShuffled((s) => !s);
    setQueue((prev) => {
      const copy = [...prev];
      // Fisher-Yates on remaining cards from current index onwards
      for (let i = copy.length - 1; i > index; i--) {
        const j = index + Math.floor(Math.random() * (i - index + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    });
  }, [index]);

  // Scale-based flip: 1 → 0 (shrink) → swap content → 0 → 1 (grow)
  const scale = useSharedValue(1);

  const doSwap = useCallback(() => {
    setShowBack((prev) => !prev);
  }, []);

  const toggleFlip = useCallback(() => {
    scale.value = withTiming(0, {
      duration: 150,
      easing: Easing.in(Easing.ease),
    }, (done) => {
      if (done) {
        runOnJS(doSwap)();
        scale.value = withTiming(1, {
          duration: 200,
          easing: Easing.out(Easing.back(1.5)),
        });
      }
    });
  }, [scale, doSwap]);

  const advanceCard = useCallback(() => {
    setShowBack(false);
    cardStartRef.current = Date.now();
    ratingBusyRef.current = false;
    setIndex((i) => {
      const next = i + 1;
      if (next >= list.length) {
        setFinished(true);
        return i;
      }
      return next;
    });
  }, [list.length]);

  const animateToNext = useCallback(() => {
    scale.value = withTiming(0, {
      duration: 120,
      easing: Easing.in(Easing.ease),
    }, (done) => {
      if (done) {
        runOnJS(advanceCard)();
        scale.value = withTiming(1, {
          duration: 180,
          easing: Easing.out(Easing.ease),
        });
      }
    });
  }, [scale, advanceCard]);

  const handleRate = useCallback((rating: FlashcardRating) => {
    if (!card || ratingBusyRef.current) return;
    ratingBusyRef.current = true;
    const durationMs = Date.now() - cardStartRef.current;
    setReviewedCount((n) => n + 1);
    if (rating === 1) setAgainIds((ids) => (ids.includes(card.id) ? ids : [...ids, card.id]));
    // Persist in the background; the UI advances immediately (the busy flag is
    // cleared once the flip-out animation lands on the next card, so a double
    // tap can't rate the same card twice). Failures roll back the optimistic
    // state inside the context and surface as a banner.
    reviewFlashcard(card.id, rating, durationMs).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg || T('flashcardReviewSaveFailed'));
    });
    animateToNext();
  }, [card, reviewFlashcard, animateToNext, T]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (noteId) {
      router.replace({ pathname: '/flashcard-deck-preview' as any, params: { noteId } });
      return;
    }
    router.replace('/(tabs)/notes' as any);
  }, [noteId]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: scale.value }],
  }));

  const intervals = useMemo(
    () => (card ? previewIntervals(card, new Date()) : null),
    [card],
  );
  const faces = useMemo(() => (card ? cardFaces(card) : null), [card]);

  const scopedCards = useMemo(
    () => (noteId ? flashcards.filter((c) => c.noteId === noteId) : flashcards),
    [flashcards, noteId],
  );
  const dueNow = useMemo(() => dueCounts(scopedCards, new Date()).due, [scopedCards]);

  const ratingLabels: Record<FlashcardRating, string> = {
    1: T('fsrsAgain'),
    2: T('fsrsHard'),
    3: T('fsrsGood'),
    4: T('fsrsEasy'),
  };

  const weekLabel = user?.currentWeek != null ? `W${user.currentWeek} ` : '';

  const header = (
    <View style={styles.headerRow}>
      <Pressable onPress={handleBack} style={styles.backIconWrap}>
        <Feather name="arrow-left" size={20} color={theme.text} />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.title}>{mode === 'due' ? T('flashcardDueReviewTitle') : T('activeRecall')}</Text>
        <Text style={styles.subtitle}>{weekLabel}{T('practice')}</Text>
      </View>
      {!finished && list.length > 1 ? (
        <Pressable
          onPress={toggleShuffle}
          style={[styles.backIconWrap, shuffled && { backgroundColor: theme.primary }]}
          hitSlop={8}
        >
          <Feather name="shuffle" size={18} color={shuffled ? (isDarkMinimal ? '#000000' : '#fff') : theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  // ── Empty state ──────────────────────────────────────────────────────────
  if (list.length === 0) {
    const noteForDeck = noteId ? notes.find((n) => n.id === noteId) : undefined;

    const goOpenNoteGenerate = () => {
      if (!noteForDeck) return;
      router.replace({
        pathname: '/notes-editor' as any,
        params: { subjectId: noteForDeck.subjectId, noteId: noteForDeck.id, openDeck: '1' },
      });
    };

    const goPickNote = () => {
      router.replace({ pathname: '/flashcard-pick' as any, params: {} });
    };

    const studyAll = () => {
      router.replace({
        pathname: '/flashcard-review' as any,
        params: noteId ? { noteId, mode: 'deck' } : { mode: 'deck' },
      });
    };

    const hasAnyCards = scopedCards.length > 0;
    const emptyMessage =
      mode === 'due' && hasAnyCards
        ? T('flashcardReviewNothingDue')
        : noteId
          ? noteForDeck
            ? T('flashcardReviewEmptyNote')
            : T('flashcardReviewNoteNotFound')
          : T('flashcardReviewEmptyAll');

    return (
      <View style={styles.container}>
        {header}
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>{emptyMessage}</Text>
          <View style={styles.emptyActions}>
            {mode === 'due' && hasAnyCards ? (
              <Pressable style={styles.emptyPrimaryBtn} onPress={studyAll}>
                <Text style={styles.emptyPrimaryBtnText}>{T('flashcardStudyAll')}</Text>
              </Pressable>
            ) : noteForDeck ? (
              <Pressable style={styles.emptyPrimaryBtn} onPress={goOpenNoteGenerate}>
                <Text style={styles.emptyPrimaryBtnText}>{T('flashcardReviewOpenToGenerate')}</Text>
              </Pressable>
            ) : !noteId ? (
              <Pressable style={styles.emptyPrimaryBtn} onPress={goPickNote}>
                <Text style={styles.emptyPrimaryBtnText}>{T('flashcardReviewChooseDeck')}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.emptySecondaryBtn} onPress={handleBack}>
              <Text style={styles.emptySecondaryBtnText}>{T('back')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── Session summary ──────────────────────────────────────────────────────
  if (finished || !card) {
    const now = new Date();
    const upcoming = nextDueDate(scopedCards, now);
    const stillDue = dueCounts(scopedCards, now).due;
    const nextDueLabel = stillDue > 0
      ? T('flashcardSummaryDueNow').replace('{n}', String(stillDue))
      : upcoming
        ? T('flashcardSummaryNextDue').replace('{t}', formatInterval(now, upcoming))
        : T('flashcardSummaryNoUpcoming');
    const againCards = againIds
      .map((id) => latestById.get(id))
      .filter((c): c is Flashcard => !!c);

    const reviewAgainCards = () => {
      if (againCards.length === 0) return;
      resetSession(againCards);
    };

    return (
      <View style={styles.container}>
        {header}
        <ScrollView contentContainerStyle={styles.summaryScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <View style={styles.cardIconCircle}>
              <Icons.Sparkles size={28} color={theme.primary} />
            </View>
            <Text style={styles.summaryTitle}>{T('flashcardSummaryTitle')}</Text>
            <Text style={styles.summarySub}>{nextDueLabel}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{reviewedCount}</Text>
                <Text style={styles.statLabel}>{T('flashcardSummaryReviewed')}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{againIds.length}</Text>
                <Text style={styles.statLabel}>{T('fsrsAgain')}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stillDue}</Text>
                <Text style={styles.statLabel}>{T('flashcardDueShort')}</Text>
              </View>
            </View>
            {saveError ? (
              <Text style={[styles.errorBannerText, { marginTop: 16 }]}>{T('flashcardReviewSaveFailed')}</Text>
            ) : null}
            <View style={styles.summaryActions}>
              {againCards.length > 0 ? (
                <Pressable style={styles.emptyPrimaryBtn} onPress={reviewAgainCards}>
                  <Text style={styles.emptyPrimaryBtnText}>
                    {T('flashcardSummaryReviewAgainCards').replace('{n}', String(againCards.length))}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={againCards.length > 0 ? styles.emptySecondaryBtn : styles.emptyPrimaryBtn}
                onPress={handleBack}
              >
                <Text style={againCards.length > 0 ? styles.emptySecondaryBtnText : styles.emptyPrimaryBtnText}>
                  {T('done')}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Active card ──────────────────────────────────────────────────────────
  const progress = (index + 1) / list.length;
  const typeBadge =
    faces?.isCloze ? T('flashcardTypeCloze') : card.cardType === 'concept' ? T('flashcardTypeConcept') : null;

  return (
    <View style={styles.container}>
      {header}

      {saveError ? (
        <Pressable style={styles.errorBanner} onPress={() => setSaveError(null)}>
          <Text style={styles.errorBannerText}>{T('flashcardReviewSaveFailed')}</Text>
        </Pressable>
      ) : null}

      {/* Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressMetaRow}>
          <Text style={styles.progressMetaLeft}>{T('card')} {index + 1} {T('of')} {list.length}</Text>
          <Text style={styles.progressMetaRight}>{reviewedCount} {T('flashcardSummaryReviewed')}</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      {/* Card */}
      <View style={styles.cardArea}>
        <Animated.View style={[styles.cardWrap, cardAnimStyle]}>
          {!showBack ? (
            /* ── FRONT ── */
            <Pressable style={styles.cardFront} onPress={toggleFlip}>
              {typeBadge ? (
                <View style={styles.cardTypeBadge}>
                  <Text style={styles.cardTypeBadgeText}>{typeBadge}</Text>
                </View>
              ) : null}
              <Text style={styles.cardQuestion}>{faces?.front}</Text>
              {card.hint ? <Text style={styles.cardHint}>{T('flashcardHintPrefix')} {card.hint}</Text> : null}
              <Text style={styles.tapHint}>{T('tapToReveal')}</Text>
            </Pressable>
          ) : (
            /* ── BACK ── */
            <Pressable style={styles.cardBack} onPress={toggleFlip}>
              <Text style={styles.cardAnswer}>{faces?.back}</Text>
              <View style={styles.ratingRow}>
                {RATINGS.map((r) => {
                  const good = r === 3;
                  return (
                    <Pressable
                      key={r}
                      style={[styles.ratingBtn, good && styles.ratingBtnGood]}
                      onPress={() => handleRate(r)}
                      // The interval stays out of the visible label but is kept
                      // here so screen-reader users still get the schedule.
                      accessibilityLabel={`${ratingLabels[r]}${intervals?.[r] ? `, next in ${intervals[r]}` : ''}`}
                    >
                      <Text
                        style={[styles.ratingLabel, good && styles.ratingLabelGood]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {ratingLabels[r]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          )}
        </Animated.View>
      </View>

      <Text style={styles.footerHint}>
        {T('flashcardDueFooter').replace('{n}', String(dueNow))}
      </Text>
    </View>
  );
}
