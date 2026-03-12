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
import { COLORS } from '../../src/constants';
import { useAppContext } from '../../src/context/AppContext';
import { Priority } from '../../src/types';

const SCHEDULE = [
  { time: '12:00', code: 'ISP573', name: 'Case Study Analysis' },
  { time: '17:00', code: 'LCC401', name: 'Critical Reading Exercise' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user, tasks } = useAppContext();

  const pendingTasks = tasks.filter((t) => !t.isDone);
  const totalTasks = tasks.length;
  const completionRate = Math.round(((totalTasks - pendingTasks.length) / (totalTasks || 1)) * 100);

  const highPriority = pendingTasks
    .filter((t) => t.priority === Priority.High)
    .sort((a, b) => new Date(a.dueDate + 'T' + a.dueTime).getTime() - new Date(b.dueDate + 'T' + b.dueTime).getTime());
  const priorityTask = highPriority[0] || pendingTasks[0];

  const getUrgency = () => {
    if (!priorityTask) return '';
    if (priorityTask.dueDate === '2024-12-26') return 'DUE TODAY';
    if (priorityTask.dueDate === '2024-12-27') return 'DUE TOMORROW';
    return `DUE ${priorityTask.dueDate.split('-')[1]}/${priorityTask.dueDate.split('-')[2]}`;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hi, Syahrul!</Text>
            <Text style={styles.headerSub}>LET'S MASTER YOUR WEEK.</Text>
          </View>
          <Pressable style={styles.profileBtn} onPress={() => router.push('/(tabs)/profile' as any)}>
            <Feather name="user" size={20} color={COLORS.navy} />
          </Pressable>
        </View>

        {/* Semester Pulse Card */}
        <Pressable style={styles.pulseCard} onPress={() => router.push('/stress-map' as any)}>
          <View style={styles.pulseTop}>
            <View>
              <Text style={styles.pulseWeek}>Week {user.currentWeek}</Text>
              <Text style={styles.pulseLabel}>SEMESTER PULSE</Text>
            </View>
            <View style={styles.peakBadge}>
              <Text style={styles.peakText}>W13 PEAK ALERT</Text>
            </View>
          </View>

          <View style={styles.pulseMid}>
            <Text style={styles.pulseProgressLabel}>PROGRESS</Text>
            <Text style={styles.pulseFinalLabel}>W14 FINAL</Text>
          </View>

          <View style={styles.dotsRow}>
            {Array.from({ length: 14 }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < user.currentWeek ? styles.dotFilled : styles.dotEmpty,
                  i === user.currentWeek - 1 && styles.dotCurrent,
                ]}
              />
            ))}
          </View>
        </Pressable>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <Pressable style={styles.statCard} onPress={() => router.push('/(tabs)/planner' as any)}>
            <Text style={styles.statLabel}>TOTAL TASK</Text>
            <Text style={styles.statValue}>{totalTasks}</Text>
          </Pressable>
          <Pressable style={styles.statCard} onPress={() => router.push('/weekly-summary' as any)}>
            <Text style={styles.statLabel}>PROGRESS</Text>
            <Text style={styles.statValue}>{completionRate}%</Text>
          </Pressable>
          <Pressable style={styles.statCard} onPress={() => router.push('/leaderboard' as any)}>
            <Text style={styles.statLabel}>RANK</Text>
            <Text style={styles.statValue}>#2</Text>
          </Pressable>
        </View>

        {/* Priority Task Card */}
        {priorityTask && (
          <Pressable style={styles.priorityCard} onPress={() => router.push('/(tabs)/planner' as any)}>
            <View style={styles.priorityTop}>
              <View style={styles.priorityBadge}>
                <View style={styles.priorityDot} />
                <Text style={styles.priorityBadgeText}>PRIORITY</Text>
              </View>
              <Text style={styles.priorityDue}>{getUrgency()}</Text>
            </View>
            <Text style={styles.priorityTitle} numberOfLines={2}>
              {priorityTask.title}
            </Text>
            <View style={styles.priorityMeta}>
              <Feather name="calendar" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.priorityMetaText}>{priorityTask.dueTime}</Text>
              <Text style={styles.priorityMetaSep}>{'\u2022'}</Text>
              <Feather name="check-circle" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.priorityMetaText}>{priorityTask.courseId}</Text>
            </View>
          </Pressable>
        )}

        {/* Today's Deadlines */}
        <View style={styles.deadlineSection}>
          <Text style={styles.deadlineSectionTitle}>TODAY'S DEADLINES {'\u2022'} DEC 26</Text>

          {SCHEDULE.map((item, idx) => (
            <View key={idx} style={styles.deadlineCard}>
              <View style={styles.deadlineLeft}>
                <Text style={styles.deadlineTime}>{item.time}</Text>
              </View>
              <View style={styles.deadlineRight}>
                <View style={styles.deadlineTopRow}>
                  <View style={styles.deadlineBadge}>
                    <Text style={styles.deadlineBadgeText}>DEADLINE</Text>
                  </View>
                  <Text style={styles.deadlineCode}>{item.code}</Text>
                </View>
                <Text style={styles.deadlineName}>{item.name}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginTop: 4,
  },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Semester Pulse
  pulseCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 28,
    padding: 24,
    marginBottom: 16,
  },
  pulseTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  pulseWeek: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -1,
  },
  pulseLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2,
    marginTop: 2,
  },
  peakBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  peakText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 1,
  },
  pulseMid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pulseProgressLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
  },
  pulseFinalLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotFilled: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotEmpty: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dotCurrent: {
    backgroundColor: COLORS.gold,
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.navy,
    letterSpacing: -0.5,
  },

  // Priority Card
  priorityCard: {
    borderRadius: 28,
    padding: 24,
    marginBottom: 24,
    backgroundColor: '#ef4444',
    overflow: 'hidden',
  },
  priorityTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ade80',
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 1.5,
  },
  priorityDue: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
  },
  priorityTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.3,
    lineHeight: 28,
    marginBottom: 12,
  },
  priorityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  priorityMetaSep: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },

  // Deadlines
  deadlineSection: {
    gap: 12,
  },
  deadlineSectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  deadlineCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    alignItems: 'center',
    gap: 16,
  },
  deadlineLeft: {},
  deadlineTime: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.navy,
    letterSpacing: -0.5,
  },
  deadlineRight: {
    flex: 1,
  },
  deadlineTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  deadlineBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deadlineBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 1,
  },
  deadlineCode: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  deadlineName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
