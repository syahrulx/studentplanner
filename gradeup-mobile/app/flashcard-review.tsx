import { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useDarkMinimalThemePack, useTheme } from '@/hooks/useTheme';
import { Icons } from '@/src/constants';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import type { ThemePalette } from '@/constants/Themes';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

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
      alignItems: 'center',
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
      paddingVertical: 36,
      paddingHorizontal: 28,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 6,
    },
    cardBackIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: primaryCta,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    cardAnswer: {
      fontSize: 19,
      fontWeight: '700',
      color: isDarkMinimal ? '#000000' : '#ffffff',
      textAlign: 'center',
      lineHeight: 26,
      marginBottom: 20,
    },
    cardBackActions: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    backActionBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backActionSecondary: { backgroundColor: isDarkMinimal ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)' },
    backActionPrimary: { backgroundColor: primaryCta },
    backActionSecondaryText: { fontSize: 13, fontWeight: '800', color: isDarkMinimal ? '#000000' : '#ffffff', letterSpacing: 0.5 },
    backActionPrimaryText: { fontSize: 13, fontWeight: '800', color: primaryCtaText, letterSpacing: 0.5 },
    footerHint: {
      marginTop: 12,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      letterSpacing: 1.4,
      opacity: 0.4,
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
  });
}

export default function FlashcardReview() {
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const { flashcards, notes, user, language } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();
  const isDarkMinimal = useDarkMinimalThemePack();
  const styles = useMemo(() => createStyles(theme, isDarkMinimal), [theme, isDarkMinimal]);

  const sourceList = useMemo(() => {
    if (noteId) return flashcards.filter((c) => c.noteId === noteId);
    return flashcards;
  }, [flashcards, noteId]);

  // Fix 10: Shuffle toggle — maintain an internal queue that can be randomized
  const [shuffled, setShuffled] = useState(false);
  // Fix 11: queue holds the working list; cards can be re-appended at the end
  const [queue, setQueue] = useState<typeof sourceList>(() => sourceList);

  // Sync queue when sourceList changes (e.g. card deleted during review)
  useEffect(() => {
    setQueue(sourceList);
    setIndex(0);
    setMasteredCount(0);
  }, [sourceList]);

  const [index, setIndex] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [showBack, setShowBack] = useState(false);

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

  const list = queue; // alias for readability
  const card = list[index];
  const hasNext = index < list.length - 1;

  const doSwap = useCallback(() => {
    setShowBack((prev) => !prev);
  }, []);

  const toggleFlip = useCallback(() => {
    // Phase 1: shrink to 0
    scale.value = withTiming(0, {
      duration: 150,
      easing: Easing.in(Easing.ease),
    }, (finished) => {
      if (finished) {
        // Swap content on JS thread
        runOnJS(doSwap)();
        // Phase 2: grow back to 1
        scale.value = withTiming(1, {
          duration: 200,
          easing: Easing.out(Easing.back(1.5)),
        });
      }
    });
  }, [scale, doSwap]);

  const advanceCard = useCallback(() => {
    setShowBack(false);
    setIndex((i) => i + 1);
  }, []);

  const handleNextCard = useCallback(() => {
    if (hasNext) {
      // Quick shrink, swap, grow
      scale.value = withTiming(0, {
        duration: 120,
        easing: Easing.in(Easing.ease),
      }, (finished) => {
        if (finished) {
          runOnJS(advanceCard)();
          scale.value = withTiming(1, {
            duration: 180,
            easing: Easing.out(Easing.ease),
          });
        }
      });
    } else {
      // Done reviewing — go back to Study tab instead of deep back-stack
      router.replace('/(tabs)/notes' as any);
    }
  }, [hasNext, scale, advanceCard]);

  // Fix 11: "Review Again" appends the card to the END of the queue so it genuinely
  // comes back later, instead of just advancing like "Mastered" (old behaviour).
  const handleReviewAgain = useCallback(() => {
    if (card) setQueue((prev) => [...prev, card]);
    handleNextCard();
  }, [card, handleNextCard]);

  const handleMastered = useCallback(() => {
    setMasteredCount((c) => c + 1);
    handleNextCard();
  }, [handleNextCard]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (noteId) {
      router.replace({ pathname: '/flashcard-deck-preview' as any, params: { noteId } });
      return;
    }
    router.replace('/flashcard-pick' as any);
  }, [noteId]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: scale.value }],
  }));

  // Fix 5: Guard against OOB index (can happen if Mastered is tapped on the last
  // card while the animation hasn't yet settled hasNext to false)
  if (!card && list.length > 0) {
    router.replace('/(tabs)/notes' as any);
    return null;
  }

  if (list.length === 0) {
    const noteForDeck =
      noteId && typeof noteId === 'string' ? notes.find((n) => n.id === noteId) : undefined;

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

    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} style={styles.backIconWrap}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>{T('activeRecall')}</Text>
            <Text style={styles.subtitle}>{T('practice')}</Text>
          </View>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>
            {noteId
              ? noteForDeck
                ? T('flashcardReviewEmptyNote')
                : T('flashcardReviewNoteNotFound')
              : T('flashcardReviewEmptyAll')}
          </Text>
          <View style={styles.emptyActions}>
            {noteForDeck ? (
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

  const front = card?.front ?? (card as any).question;
  const back = card?.back ?? (card as any).answer;
  const progress = (index + 1) / list.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={handleBack} style={styles.backIconWrap}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{T('activeRecall')}</Text>
          <Text style={styles.subtitle}>W{user.currentWeek} {T('practice')}</Text>
        </View>
        {/* Fix 10: Shuffle toggle button */}
        <Pressable
          onPress={toggleShuffle}
          style={[styles.backIconWrap, shuffled && { backgroundColor: theme.primary }]}
          hitSlop={8}
        >
          <Feather name="shuffle" size={18} color={shuffled ? (isDarkMinimal ? '#000000' : '#fff') : theme.textSecondary} />
        </Pressable>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressMetaRow}>
          <Text style={styles.progressMetaLeft}>{T('card')} {index + 1} {T('of')} {list.length}</Text>
          <Text style={styles.progressMetaRight}>{masteredCount} {T('mastered')}</Text>
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
              <View style={styles.cardIconCircle}>
                <Icons.Layers size={28} color={theme.primary} />
              </View>
              <Text style={styles.cardQuestion}>{front}</Text>
              <Text style={styles.tapHint}>{T('tapToReveal')}</Text>
            </Pressable>
          ) : (
            /* ── BACK ── */
            <Pressable style={styles.cardBack} onPress={toggleFlip}>
              <View style={styles.cardBackIconCircle}>
                <Icons.Sparkles size={26} color={isDarkMinimal ? '#000000' : '#fff'} />
              </View>
              <Text style={styles.cardAnswer}>{back}</Text>
              <View style={styles.cardBackActions}>
                <Pressable style={[styles.backActionBtn, styles.backActionSecondary]} onPress={handleReviewAgain}>
                  <Text style={styles.backActionSecondaryText}>{T('reviewAgain')}</Text>
                </Pressable>
                <Pressable style={[styles.backActionBtn, styles.backActionPrimary]} onPress={handleMastered}>
                  <Text style={styles.backActionPrimaryText}>{T('mastered')}</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        </Animated.View>
      </View>

      <Text style={styles.footerHint}>{T('swipeGestures')}</Text>
    </View>
  );
}
