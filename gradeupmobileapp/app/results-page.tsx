import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';

export default function ResultsPageScreen() {
  const router = useRouter();
  const { quizScore } = useAppContext();
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const translateY = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreNumber}>{quizScore}</Text>
          <Text style={styles.scoreLabel}>Total Points</Text>
        </View>

        <Animated.View style={[styles.sparkleBadge, { transform: [{ translateY }] }]}>
          <Feather name="zap" size={32} color={COLORS.gold} />
        </Animated.View>

        <Text style={styles.title}>Excellent Work!</Text>
        <Text style={styles.feedback}>
          You've demonstrated solid understanding of the material. Keep it up!
        </Text>

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0:45s</Text>
            <Text style={styles.statLabel}>Time Taken</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>85%</Text>
            <Text style={styles.statLabel}>Accuracy</Text>
          </View>
        </View>

        <Pressable
          style={styles.leaderboardBtn}
          onPress={() => router.push('/leaderboard')}
        >
          <Text style={styles.leaderboardBtnText}>View Leaderboard</Text>
          <Feather name="arrow-right" size={20} color={COLORS.white} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  scoreBox: {
    backgroundColor: COLORS.navy,
    borderRadius: 32,
    padding: 40,
    alignItems: 'center',
    marginBottom: 24,
    minWidth: 200,
  },
  scoreNumber: {
    fontSize: 56,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 4,
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gold,
  },
  sparkleBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.navy,
    marginBottom: 12,
  },
  feedback: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 32,
  },
  statItem: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 24,
    minWidth: 120,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.navy,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  leaderboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 32,
    gap: 10,
  },
  leaderboardBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
  },
});
