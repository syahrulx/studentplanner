import React from 'react';
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
import { useAppContext } from '../src/context/AppContext';

const TOP_TASKS = [
  'Final Project: Backend API - CSC584',
  'ISP573 Case Study Analysis',
  'System Design Document - IPS551',
];

export default function AIPageScreen() {
  const router = useRouter();
  const { user } = useAppContext();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Smart Hub</Text>
        <View style={styles.weekBadge}>
          <Text style={styles.weekBadgeText}>Week {user.currentWeek}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Knowledge Check CTA */}
        <View style={styles.knowledgeCard}>
          <Feather name="book-open" size={28} color={COLORS.gold} />
          <View style={styles.knowledgeContent}>
            <Text style={styles.knowledgeTitle}>Knowledge Check</Text>
            <Text style={styles.knowledgeDesc}>
              Test your understanding with AI-generated quiz
            </Text>
            <Pressable
              style={styles.generateBtn}
              onPress={() => router.push('/quiz-config' as any)}
            >
              <Text style={styles.generateBtnText}>Generate Quiz</Text>
            </Pressable>
          </View>
        </View>

        {/* Smart Priority */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Smart Priority</Text>
          {TOP_TASKS.map((task, i) => (
            <View key={i} style={styles.taskRow}>
              <View style={styles.taskNum}>
                <Text style={styles.taskNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.taskText}>{task}</Text>
            </View>
          ))}
        </View>

        {/* Workload Analysis */}
        <View style={styles.workloadCard}>
          <Text style={styles.workloadTitle}>Workload Analysis</Text>
          <Text style={styles.workloadScore}>7.8/10</Text>
          <Text style={styles.workloadLabel}>Stress Score</Text>
          <Pressable
            style={styles.viewSowBtn}
            onPress={() => router.push('/stress-map' as any)}
          >
            <Text style={styles.viewSowBtnText}>View SOW Intelligence</Text>
          </Pressable>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
  },
  weekBadge: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  weekBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  knowledgeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: COLORS.gold,
    gap: 16,
  },
  knowledgeContent: { flex: 1 },
  knowledgeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
    marginBottom: 4,
  },
  knowledgeDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  generateBtn: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gold,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  generateBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  taskNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskNumText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },
  taskText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },

  workloadCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 20,
    padding: 24,
  },
  workloadTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 12,
  },
  workloadScore: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.gold,
    marginBottom: 4,
  },
  workloadLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 20,
  },
  viewSowBtn: {
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  viewSowBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },
});
