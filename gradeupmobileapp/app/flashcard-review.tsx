import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';

export default function FlashcardReviewScreen() {
  const router = useRouter();
  const { flashcards } = useAppContext();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useState(new Animated.Value(0))[0];

  const remaining = flashcards.filter((f) => !masteredIds.has(f.id));
  const currentCard = remaining[currentIndex];
  const masteredCount = masteredIds.size;
  const totalCount = flashcards.length;

  const flip = () => {
    Animated.spring(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 10,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const handleReviewAgain = () => {
    setCurrentIndex((i) => Math.min(i + 1, remaining.length - 1));
    setIsFlipped(false);
    flipAnim.setValue(0);
  };

  const handleMastered = () => {
    if (currentCard) {
      setMasteredIds((prev) => new Set([...prev, currentCard.id]));
      setCurrentIndex(0);
      setIsFlipped(false);
      flipAnim.setValue(0);
    }
  };

  useEffect(() => {
    if (remaining.length === 0 && totalCount > 0) {
      router.back();
    }
  }, [remaining.length, totalCount]);

  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  if (flashcards.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color={COLORS.navy} />
          </Pressable>
          <Text style={styles.headerTitle}>Active Recall</Text>
          <Text style={styles.headerSub}>No flashcards</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentCard) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Active Recall</Text>
          <Text style={styles.headerSub}>W11 Practice</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(masteredCount / totalCount) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {masteredCount} / {totalCount} mastered
        </Text>
      </View>

      {/* Flip Card */}
      <Pressable style={styles.cardContainer} onPress={flip}>
        <Animated.View
          style={[styles.card, styles.cardFront, { opacity: frontOpacity }]}
          pointerEvents={isFlipped ? 'none' : 'auto'}
        >
          <Text style={styles.cardQuestion}>{currentCard.question}</Text>
          <Text style={styles.tapHint}>Tap to Reveal</Text>
        </Animated.View>
        <Animated.View
          style={[styles.card, styles.cardBack, { opacity: backOpacity }]}
          pointerEvents={isFlipped ? 'auto' : 'none'}
        >
          <Text style={styles.cardAnswer}>{currentCard.answer}</Text>
          <View style={styles.cardActions}>
            <Pressable style={styles.reviewBtn} onPress={handleReviewAgain}>
              <Text style={styles.reviewBtnText}>Review Again</Text>
            </Pressable>
            <Pressable style={styles.masteredBtn} onPress={handleMastered}>
              <Text style={styles.masteredBtnText}>Mastered</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  progressSection: { padding: 20 },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  cardContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    minHeight: 220,
    borderRadius: 24,
    padding: 24,
    position: 'absolute',
    left: 20,
    right: 20,
  },
  cardFront: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardBack: {
    backgroundColor: COLORS.navy,
  },
  cardQuestion: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 24,
    lineHeight: 26,
  },
  tapHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  cardAnswer: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.white,
    marginBottom: 24,
    lineHeight: 24,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  reviewBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  reviewBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  masteredBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
  },
  masteredBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.navy,
  },
});
