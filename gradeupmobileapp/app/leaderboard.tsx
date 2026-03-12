import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';

const QUIZ_RANKINGS = [
  { rank: 1, name: 'Ahmad Zaki', score: 98 },
  { rank: 2, name: 'You', score: 95 },
  { rank: 3, name: 'Siti Nur', score: 92 },
  { rank: 4, name: 'Muhammad Ali', score: 88 },
  { rank: 5, name: 'Nurul Izzah', score: 85 },
];

const TASK_RANKINGS = [
  { rank: 1, name: 'Nurul Izzah', tasks: 42 },
  { rank: 2, name: 'You', tasks: 38 },
  { rank: 3, name: 'Ahmad Zaki', tasks: 35 },
  { rank: 4, name: 'Siti Nur', tasks: 32 },
  { rank: 5, name: 'Muhammad Ali', tasks: 28 },
];

export default function LeaderboardScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'quiz' | 'task'>('quiz');

  const quizList = QUIZ_RANKINGS;
  const taskList = TASK_RANKINGS;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <Text style={styles.headerTitle}>Leaderboard</Text>
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === 'quiz' && styles.tabActive]}
          onPress={() => setActiveTab('quiz')}
        >
          <Text style={[styles.tabText, activeTab === 'quiz' && styles.tabTextActive]}>
            Quiz Rank
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'task' && styles.tabActive]}
          onPress={() => setActiveTab('task')}
        >
          <Text style={[styles.tabText, activeTab === 'task' && styles.tabTextActive]}>
            Task Rank
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Rankings List */}
        {(activeTab === 'quiz' ? quizList : taskList).map((entry) => (
          <View
            key={entry.rank}
            style={[
              styles.rankRow,
              entry.name === 'You' && styles.rankRowHighlight,
            ]}
          >
            <View
              style={[
                styles.rankBadge,
                entry.rank === 1 && styles.rankBadgeGold,
              ]}
            >
              <Text
                style={[
                  styles.rankNumber,
                  entry.rank === 1 && styles.rankNumberGold,
                ]}
              >
                {entry.rank}
              </Text>
            </View>
            <Text style={[styles.rankName, entry.name === 'You' && styles.rankNameHighlight]}>
              {entry.name}
            </Text>
            <Text style={styles.rankValue}>
              {activeTab === 'quiz'
                ? `${(entry as { score: number }).score} pts`
                : `${(entry as { tasks: number }).tasks} tasks`}
            </Text>
          </View>
        ))}

        {/* Motivational Quote */}
        <View style={styles.quoteCard}>
          <Feather name="message-circle" size={20} color={COLORS.gold} />
          <Text style={styles.quoteText}>
            "Success is not final, failure is not fatal: it is the courage to continue that counts."
          </Text>
        </View>
      </ScrollView>
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

  tabRow: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.white,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rankRowHighlight: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  rankBadgeGold: {
    backgroundColor: COLORS.gold,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.navy,
  },
  rankNumberGold: {
    color: COLORS.navy,
  },
  rankName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  rankNameHighlight: {
    color: COLORS.white,
  },
  rankValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gold,
  },

  quoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 20,
    marginTop: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.gold,
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },
  quoteText: {
    flex: 1,
    fontSize: 14,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
});
