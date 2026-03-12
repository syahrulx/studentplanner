import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { COLORS, Icons } from '@/src/constants';
import { useTranslations } from '@/src/i18n';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';

export default function FlashcardReview() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  const { flashcards, user, language } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();
  const list = useMemo(() => {
    if (folderId) return flashcards.filter((c) => c.folderId === folderId);
    return flashcards;
  }, [flashcards, folderId]);
  const [index, setIndex] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);

  const rotation = useSharedValue(0);
  const isFlipped = useSharedValue(false);

  const card = list[index];
  const hasNext = index < list.length - 1;

  const toggleFlip = useCallback(() => {
    const next = !isFlipped.value;
    isFlipped.value = next;
    rotation.value = withTiming(next ? 180 : 0, {
      duration: 500,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
    });
  }, [rotation, isFlipped]);

  const handleNextCard = useCallback(() => {
    if (hasNext) {
      rotation.value = 0;
      isFlipped.value = false;
      setIndex((i) => i + 1);
    } else {
      router.back();
    }
  }, [hasNext, rotation, isFlipped]);

  const handleMastered = useCallback(() => {
    setMasteredCount((c) => c + 1);
    handleNextCard();
  }, [handleNextCard]);

  const frontAnimStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 180], [0, 180]);
    const opacity = interpolate(rotation.value, [0, 89, 90, 180], [1, 1, 0, 0]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity,
    };
  });

  const backAnimStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 180], [180, 360]);
    const opacity = interpolate(rotation.value, [0, 89, 90, 180], [0, 0, 1, 1]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity,
    };
  });

  if (list.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.empty, { color: theme.textSecondary }]}>{T('noFlashcardsInFolder')}</Text>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{T('back')}</Text>
        </Pressable>
      </View>
    );
  }

  const front = card?.front ?? (card as any).question;
  const back = card?.back ?? (card as any).answer;
  const progress = (index + 1) / list.length;

  return (
    <View style={[styles.container, { backgroundColor: '#f9fafb' }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backIconWrap}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{T('activeRecall')}</Text>
          <Text style={styles.subtitle}>W{user.currentWeek} {T('practice')}</Text>
        </View>
      </View>

      <View style={styles.progressMetaRow}>
        <Text style={styles.progressMetaLeft}>{T('card')} {index + 1} {T('of')} {list.length}</Text>
        <Text style={styles.progressMetaRight}>{masteredCount} {T('mastered')}</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.cardOuter}>
        {/* Front */}
        <Animated.View style={[styles.cardFace, frontAnimStyle]}>
          <Pressable style={styles.cardFront} onPress={toggleFlip}>
            <View style={styles.cardIconCircle}>
              <Icons.Layers size={28} color={COLORS.navy} />
            </View>
            <Text style={styles.cardQuestion}>{front}</Text>
            <Text style={styles.tapHint}>{T('tapToReveal')}</Text>
          </Pressable>
        </Animated.View>

        {/* Back */}
        <Animated.View style={[styles.cardFace, backAnimStyle]}>
          <Pressable style={styles.cardBackTap} onPress={toggleFlip}>
            <View style={styles.cardBack}>
              <View style={styles.cardBackIconCircle}>
                <Icons.Sparkles size={26} color={COLORS.white} />
              </View>
              <Text style={styles.cardAnswer}>{back}</Text>
              <View style={styles.cardBackActions}>
                <Pressable style={[styles.backActionBtn, styles.backActionSecondary]} onPress={handleNextCard}>
                  <Text style={styles.backActionSecondaryText}>{T('reviewAgain')}</Text>
                </Pressable>
                <Pressable style={[styles.backActionBtn, styles.backActionPrimary]} onPress={handleMastered}>
                  <Text style={styles.backActionPrimaryText}>{T('mastered')}</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </View>

      <Text style={styles.footerHint}>{T('swipeGestures')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 12,
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#020617', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.2, marginTop: 4 },
  progressMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressMetaLeft: { fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 1.2 },
  progressMetaRight: { fontSize: 11, fontWeight: '800', color: '#d1d5db', letterSpacing: 1.2, textAlign: 'right' },
  progressBarBg: { height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 20 },
  progressBarFill: { height: '100%', borderRadius: 2, backgroundColor: '#facc15' },
  cardOuter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingVertical: 0,
    overflow: 'visible',
  },
  cardFace: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
  },
  cardFront: {
    borderRadius: 32,
    backgroundColor: '#ffffff',
    paddingVertical: 32,
    paddingHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 8,
  },
  cardIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e5f2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  cardQuestion: {
    fontSize: 20,
    fontWeight: '800',
    color: '#020617',
    textAlign: 'center',
    marginBottom: 16,
  },
  tapHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#d4d4d8',
    letterSpacing: 1.2,
    marginTop: 8,
  },
  cardBackTap: { width: '100%' },
  cardBack: {
    borderRadius: 32,
    backgroundColor: '#003366',
    paddingVertical: 32,
    paddingHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 8,
  },
  cardBackIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  cardAnswer: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  cardBackActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  backActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backActionSecondary: { backgroundColor: '#0f172a' },
  backActionPrimary: { backgroundColor: '#fbbf24' },
  backActionSecondaryText: { fontSize: 13, fontWeight: '800', color: '#e5e7eb', letterSpacing: 0.8 },
  backActionPrimaryText: { fontSize: 13, fontWeight: '800', color: '#0f172a', letterSpacing: 0.8 },
  footerHint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#d4d4d8',
    letterSpacing: 1.4,
  },
  empty: { fontSize: 16, color: COLORS.gray, textAlign: 'center', marginTop: 48 },
  backBtn: { marginTop: 24, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 24, backgroundColor: COLORS.navy, borderRadius: 12 },
  backBtnText: { color: COLORS.white, fontWeight: '700' },
});
