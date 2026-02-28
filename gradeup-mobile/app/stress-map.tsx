import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS } from '@/src/constants';
import Feather from '@expo/vector-icons/Feather';

const TOTAL_WEEKS = 14;

export default function StressMap() {
  const { user, courses } = useApp();
  const weeks = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);
  const maxWork = 10;

  // Subject load levels: derive from workload for current week (0–10) → display as LEVEL x.x
  const subjectLevels = useMemo(() => {
    return courses.map((c) => {
      const w = c.workload?.[user.currentWeek - 1] ?? 0;
      return { id: c.id, level: Math.min(10, Math.max(0, w)) };
    });
  }, [courses, user.currentWeek]);

  const levels = useMemo(
    () => subjectLevels.reduce((acc, { id, level }) => ({ ...acc, [id]: level }), {} as Record<string, number>),
    [subjectLevels]
  );

  const weeklyTotals = useMemo(() => {
    return weeks.map((w) =>
      courses.reduce((sum, c) => sum + (c.workload?.[w - 1] ?? 0), 0)
    );
  }, [courses, weeks]);

  const maxTotal = Math.max(...weeklyTotals, 1);
  const highestWeek = useMemo(() => {
    let max = 0;
    let week = 1;
    weeklyTotals.forEach((t, i) => {
      if (t > max) {
        max = t;
        week = i + 1;
      }
    });
    return week;
  }, [weeklyTotals]);

  const avgStress = useMemo(() => {
    const sum = weeklyTotals.reduce((a, b) => a + b, 0);
    return (sum / TOTAL_WEEKS).toFixed(1);
  }, [weeklyTotals]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>SOW Intelligence</Text>
          <Text style={styles.subtitle}>PART {user.part} ISE • AI MANAGED</Text>
        </View>
      </View>

      {/* Workload Velocity */}
      <View style={styles.velocityCard}>
        <View style={styles.velocityHeader}>
          <View>
            <Text style={styles.velocityLabel}>WORKLOAD VELOCITY</Text>
            <View style={styles.criticalRow}>
              <View style={styles.criticalDot} />
              <Text style={styles.criticalText}>CRITICAL WAVE</Text>
            </View>
          </View>
          <View style={styles.scaleRange}>
            <Text style={styles.scaleW14}>W14</Text>
            <Text style={styles.scaleLabel}>SCALE RANGE</Text>
          </View>
        </View>
        <View style={styles.barChart}>
          {weeks.map((w) => {
            const total = weeklyTotals[w - 1] ?? 0;
            const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
            const isCurrent = w === user.currentWeek;
            return (
              <View key={w} style={styles.barCol}>
                <View
                  style={[
                    styles.barBg,
                    { height: `${Math.max(8, pct)}%` },
                    isCurrent && styles.barCurrent,
                  ]}
                />
                <Text
                  style={[styles.barWeekLabel, isCurrent && styles.barWeekLabelCurrent]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  W{w}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, styles.summaryCardLeft]}>
          <Text style={styles.summaryLabel}>AVG. STRESS</Text>
          <Text style={styles.summaryValue}>{avgStress}</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardRight]}>
          <Text style={styles.summaryLabel}>HIGHEST WEEK</Text>
          <Text style={[styles.summaryValue, styles.summaryValueRed]}>W{highestWeek}</Text>
        </View>
      </View>

      {/* Subject Load Breakdown */}
      <View style={styles.breakdownSection}>
        <View style={styles.breakdownHeader}>
          <Text style={styles.breakdownTitle}>SUBJECT LOAD BREAKDOWN</Text>
          <Text style={styles.breakdownAi}>AI SYNC ACTIVE</Text>
        </View>
        {courses.map((course) => {
          const level = levels[course.id] ?? subjectLevels.find((s) => s.id === course.id)?.level ?? 0;
          const segmentCount = 10;
          const activeIndex = Math.min(segmentCount - 1, Math.floor(level));
          return (
            <View key={course.id} style={styles.subjectRow}>
              <View style={styles.subjectTopRow}>
                <Text style={styles.subjectCode}>{course.id}</Text>
                <Text style={styles.levelText}>LEVEL {level.toFixed(1)}</Text>
              </View>
              <View style={styles.segmentBar}>
                {Array.from({ length: segmentCount }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.segment,
                      i === activeIndex && styles.segmentActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray,
    marginTop: 4,
    letterSpacing: 0.5,
  },

  // Workload Velocity
  velocityCard: {
    backgroundColor: '#1e3a5f',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  velocityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  velocityLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.2,
  },
  criticalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  criticalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  criticalText: { fontSize: 12, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  scaleRange: { alignItems: 'flex-end' },
  scaleW14: { fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5 },
  scaleLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
  },
  barCol: {
    flex: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 1,
  },
  barBg: {
    width: '100%',
    minHeight: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 999,
  },
  barCurrent: {
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  barWeekLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
    minWidth: 22,
    textAlign: 'center',
  },
  barWeekLabelCurrent: {
    color: '#ffffff',
    fontWeight: '800',
  },

  // Summary cards
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryCardLeft: {},
  summaryCardRight: {},
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.gray,
    letterSpacing: 1,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
  },
  summaryValueRed: {
    color: '#dc2626',
  },

  // Subject Load Breakdown
  breakdownSection: {},
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  breakdownTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 1.2,
  },
  breakdownAi: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.gray,
    letterSpacing: 0.5,
  },
  subjectRow: {
    marginBottom: 18,
  },
  subjectTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectCode: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray,
  },
  segmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
  },
  segmentActive: {
    backgroundColor: '#475569',
  },
});
